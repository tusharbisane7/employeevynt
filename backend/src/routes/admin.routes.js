import { Router } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import { query } from '../config/db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { pdfUpload } from '../middleware/upload.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/overview', async (_req, res) => {
  const [employees, projects, docs] = await Promise.all([
    query(`SELECT id, employee_code, name, email, phone, job_title, date_of_joining, date_of_expiry,
      is_active, must_change_password, password_changed_at, created_at
      FROM users WHERE role='employee' AND deleted_at IS NULL ORDER BY created_at DESC`),
    query(`SELECT p.*, m.name AS manager_name FROM projects p LEFT JOIN managers m ON m.id=p.manager_id ORDER BY p.created_at DESC`),
    query(`SELECT d.*, u.name AS employee_name, u.employee_code FROM employee_documents d JOIN users u ON u.id=d.employee_id ORDER BY d.uploaded_at DESC LIMIT 50`)
  ]);
  res.json({ employees: employees.rows, projects: projects.rows, documents: docs.rows });
});

router.post('/employees', async (req, res) => {
  const { name, email, phone, password, jobTitle, dateOfJoining, dateOfExpiry } = req.body;
  if (!name || !email || !phone || !password || !dateOfJoining) return res.status(400).json({ message: 'Name, email, phone, password, role and joining date are required' });
  if (password.length < 10) return res.status(400).json({ message: 'Temporary password must be at least 10 characters' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await query(`INSERT INTO users(name,email,phone,password_hash,role,job_title,date_of_joining,date_of_expiry)
      VALUES($1,$2,$3,$4,'employee',$5,$6,$7)
      RETURNING id,employee_code,name,email,phone,job_title,date_of_joining,date_of_expiry,is_active,must_change_password`,
      [name.trim(), email.trim().toLowerCase(), phone.trim(), hash, jobTitle || 'Employee', dateOfJoining, dateOfExpiry || null]);
    res.status(201).json({ employee: r.rows[0] });
  } catch (e) {
    res.status(e.code === '23505' ? 409 : 500).json({ message: e.code === '23505' ? 'Email already exists' : 'Could not create employee' });
  }
});

router.patch('/employees/:id', async (req, res) => {
  const { name, email, phone, jobTitle, dateOfJoining, dateOfExpiry } = req.body;
  const r = await query(`UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email),
    phone=COALESCE($3,phone), job_title=COALESCE($4,job_title),
    date_of_joining=COALESCE($5,date_of_joining), date_of_expiry=$6, updated_at=NOW()
    WHERE id=$7 AND role='employee' AND deleted_at IS NULL
    RETURNING id,employee_code,name,email,phone,job_title,date_of_joining,date_of_expiry,is_active`,
    [name || null, email?.toLowerCase() || null, phone || null, jobTitle || null, dateOfJoining || null, dateOfExpiry || null, req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ message: 'Employee not found' });
  res.json({ employee: r.rows[0] });
});

router.patch('/employees/:id/status', async (req, res) => {
  const { isActive } = req.body;
  const r = await query(`UPDATE users SET is_active=$1, updated_at=NOW()
    WHERE id=$2 AND role='employee' AND deleted_at IS NULL RETURNING id,is_active`, [!!isActive, req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ message: 'Employee not found' });
  res.json({ employee: r.rows[0] });
});

router.delete('/employees/:id', async (req, res) => {
  const r = await query(`UPDATE users SET deleted_at=NOW(), is_active=FALSE WHERE id=$1 AND role='employee' AND deleted_at IS NULL RETURNING id`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ message: 'Employee not found' });
  res.json({ message: 'Employee removed' });
});

router.get('/managers', async (_req, res) => {
  const r = await query('SELECT * FROM managers ORDER BY name');
  res.json({ managers: r.rows });
});
router.post('/managers', async (req, res) => {
  const { name, roleTitle, email, phone } = req.body;
  if (!name || !roleTitle || !email || !phone) return res.status(400).json({ message: 'All manager fields are required' });
  const r = await query('INSERT INTO managers(name,role_title,email,phone) VALUES($1,$2,$3,$4) RETURNING *', [name,roleTitle,email,phone]);
  res.status(201).json({ manager: r.rows[0] });
});

router.post('/projects', async (req, res) => {
  const { projectName, description, status, startDate, deadline, managerId, employeeIds=[] } = req.body;
  if (!projectName || !startDate || !deadline) return res.status(400).json({ message: 'Project name, start date and deadline are required' });
  const r = await query(`INSERT INTO projects(project_name,description,status,start_date,deadline,manager_id)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [projectName,description || '',status || 'Not Started',startDate,deadline,managerId || null]);
  for (const employeeId of employeeIds) {
    await query('INSERT INTO project_members(project_id,employee_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [r.rows[0].id, employeeId]);
  }
  res.status(201).json({ project: r.rows[0] });
});

router.patch('/projects/:id', async (req, res) => {
  const { projectName, description, status, startDate, deadline, managerId, employeeIds=[] } = req.body;
  const r = await query(`UPDATE projects SET project_name=COALESCE($1,project_name),
    description=COALESCE($2,description), status=COALESCE($3,status),
    start_date=COALESCE($4,start_date), deadline=COALESCE($5,deadline),
    manager_id=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
    [projectName || null,description ?? null,status || null,startDate || null,deadline || null,managerId || null,req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ message: 'Project not found' });
  await query('DELETE FROM project_members WHERE project_id=$1', [req.params.id]);
  for (const employeeId of employeeIds) await query('INSERT INTO project_members(project_id,employee_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id,employeeId]);
  res.json({ project: r.rows[0] });
});

router.delete('/projects/:id', async (req, res) => {
  await query('DELETE FROM projects WHERE id=$1', [req.params.id]);
  res.json({ message: 'Project deleted' });
});

router.post('/employees/:id/documents', pdfUpload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Please upload a PDF up to 10 MB' });
  const { documentType='certificate', title } = req.body;
  const allowed = ['offer_letter','completion_certificate','recommendation_letter','certificate','other'];
  if (!allowed.includes(documentType)) return res.status(400).json({ message: 'Invalid document type' });
  const filePath = `/api/files/${path.basename(req.file.path)}`;
  const r = await query(`INSERT INTO employee_documents(employee_id,document_type,title,file_name,storage_path)
    SELECT id,$2,$3,$4,$5 FROM users WHERE id=$1 AND role='employee' AND deleted_at IS NULL
    RETURNING *`, [req.params.id,documentType,title || req.file.originalname,req.file.originalname,filePath]);
  if (!r.rows[0]) return res.status(404).json({ message: 'Employee not found' });
  res.status(201).json({ document: r.rows[0] });
});

export default router;
