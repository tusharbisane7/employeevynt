import React, { useEffect, useState } from 'react';
import { api, getToken, fileUrl } from './api';
import EmployeePayment from './payments/EmployeePayment.jsx';
import AdminPayments from './payments/AdminPayments.jsx';
import { Home, FolderKanban, UserRound, Settings, FileText, Award, LogOut, Menu, X, ShieldCheck, Plus, Search, Users, CalendarDays, Clock3, Upload, LockKeyhole, ExternalLink, BriefcaseBusiness, CheckCircle2, AlertCircle, Camera, Trash2, Power, RefreshCw, MapPin, History, CreditCard } from 'lucide-react';

const homeUrl = import.meta.env.VITE_HOME_URL || 'https://vyntaralabs.tech';
const date = v => v ? new Date(v).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const initialForm = {name:'',email:'',phone:'',password:'',jobTitle:'Employee',dateOfJoining:'',dateOfExpiry:''};

// Open a protected employee document with the saved Bearer token.
// The blank tab is opened synchronously so browser popup blockers do not
// prevent the PDF from opening after the authenticated request completes.
async function openAuthenticatedDocument(path) {
  const token = getToken();

  if (!token) {
    throw new Error('Authentication required. Please sign in again.');
  }

  const newTab = window.open('about:blank', '_blank');

  try {
    const response = await fetch(fileUrl(path), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 401) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      throw new Error(errorData.message || 'Unable to open this document.');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    if (newTab && !newTab.closed) {
      newTab.location.href = objectUrl;
    } else {
      // Fallback if the browser blocks the new tab.
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'employee-document.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    // Keep the object URL alive while the PDF viewer loads.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  } catch (error) {
    if (newTab && !newTab.closed) {
      newTab.close();
    }
    throw error;
  }
}


const motionCss = `
@keyframes vyntaraFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes vyntaraToastIn { from { opacity: 0; transform: translate3d(24px,-8px,0) scale(.97); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } }
@keyframes vyntaraToastOut { to { opacity: 0; transform: translate3d(20px,-6px,0) scale(.98); } }
@keyframes vyntaraPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } 50% { box-shadow: 0 0 0 5px rgba(16,185,129,.10); } }
.app-shell, .login-shell, .auth-shell { animation: vyntaraFadeUp .45s ease both; }
.main > :not(.page-heading) { animation: vyntaraFadeUp .38s ease both; }
.content-card, .stat-card, .project-card, .quick-card, .verification-card, .manager-card { transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
.content-card:hover, .stat-card:hover, .project-card:hover, .quick-card:hover, .verification-card:hover, .manager-card:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(15,23,42,.08); }
button, .nav-item, .site-link { transition: transform .18s ease, filter .18s ease, background-color .18s ease; }
button:active { transform: scale(.97); }
button:disabled { cursor: wait; opacity: .65; }
input, select, textarea { transition: border-color .18s ease, box-shadow .18s ease; }
input:focus, select:focus, textarea:focus { outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
.vyntara-toast-wrap { position: fixed; z-index: 99999; top: 22px; right: 22px; width: min(390px, calc(100vw - 32px)); display: grid; gap: 10px; pointer-events: none; }
.vyntara-toast { display: flex; align-items: flex-start; gap: 11px; padding: 14px 16px; border-radius: 13px; background: #fff; color: #172033; border: 1px solid #e5e7eb; box-shadow: 0 16px 45px rgba(15,23,42,.17); animation: vyntaraToastIn .28s cubic-bezier(.2,.8,.2,1) both; pointer-events: auto; }
.vyntara-toast.error { border-left: 4px solid #dc2626; }
.vyntara-toast.success { border-left: 4px solid #16a34a; }
.vyntara-toast-icon { flex: 0 0 auto; margin-top: 1px; }
.vyntara-toast.error .vyntara-toast-icon { color: #dc2626; }
.vyntara-toast.success .vyntara-toast-icon { color: #16a34a; }
.vyntara-toast strong { display: block; font-size: 13px; margin-bottom: 2px; }
.vyntara-toast span { display: block; font-size: 13px; line-height: 1.45; color: #475569; overflow-wrap: anywhere; }
.vyntara-toast-close { margin-left: auto; border: 0; background: transparent; color: #64748b; padding: 0 2px; cursor: pointer; font-size: 18px; line-height: 1; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
`;

function ToastPopup({ error='', success='' }) {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    const message = error || success;
    if (!message) return;
    setToast({ type: error ? 'error' : 'success', message, id: Date.now() });
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [error, success]);
  if (!toast) return null;
  const isError = toast.type === 'error';
  return <div className="vyntara-toast-wrap" role="status" aria-live="polite">
    <div className={`vyntara-toast ${toast.type}`} key={toast.id}>
      <span className="vyntara-toast-icon">{isError ? <AlertCircle size={19}/> : <CheckCircle2 size={19}/>}</span>
      <div><strong>{isError ? 'Something went wrong' : 'Successful'}</strong><span>{toast.message}</span></div>
      <button className="vyntara-toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button>
    </div>
  </div>;
}


function ProtectedImage({ path, alt = 'Profile photo' }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = null;

    async function load() {
      try {
        const token = getToken();
        if (!token || !path) return;

        const response = await fetch(fileUrl(path), {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) return;
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) setSrc(objectUrl);
      } catch (error) {
        console.error('Unable to load protected profile image:', error);
      }
    }

    load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return src ? <img src={src} alt={alt} /> : <span>{alt?.[0] || 'U'}</span>;
}


export default function App(){
  const [token,setToken] = useState(getToken());
  const [user,setUser] = useState(null);
  const [page,setPage] = useState('home');
  const [menu,setMenu] = useState(false);
  const [data,setData] = useState({projects:[],documents:[],verificationDocuments:[]});
  const [verificationBusy,setVerificationBusy] = useState(false);
  const [profile,setProfile] = useState(null);
  const [admin,setAdmin] = useState({employees:[],projects:[],documents:[]});
  const [managers,setManagers] = useState([]);
  const [loading,setLoading] = useState(!!getToken());
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [login,setLogin] = useState({email:'',password:''});
  const [pw,setPw] = useState({currentPassword:'',newPassword:'',confirm:''});
  const [employeeForm,setEmployeeForm] = useState(initialForm);
  const [projectForm,setProjectForm] = useState({projectName:'',description:'',status:'Not Started',startDate:'',deadline:'',managerId:'',employeeIds:[]});
  const [managerForm,setManagerForm] = useState({name:'',roleTitle:'Project Manager',email:'',phone:''});
  const [docForm,setDocForm] = useState({employeeId:'',documentType:'certificate',title:''});
  const [docFile,setDocFile] = useState(null);
  const [search,setSearch] = useState('');
  const [loginActivities,setLoginActivities] = useState([]);
  const [myLoginActivities,setMyLoginActivities] = useState([]);
  const [activityId,setActivityId] = useState(null);
  const [locationStatus,setLocationStatus] = useState('not_asked');

  async function load(){
    let loadedUserId = null;
    try {
      const me = await api('/auth/me');
      loadedUserId = me.user.id;
      setUser(me.user);

      // Create one activity record per authenticated browser tab/session.
      if(me.user.role === 'employee') {
        const activityKey = `vyt_activity_${me.user.id}`;
        let savedActivityId = sessionStorage.getItem(activityKey);
        if(!savedActivityId) {
          const activity = await api('/employee/login-activity', {
            method: 'POST',
            body: JSON.stringify({ locationStatus: 'not_asked' })
          });
          savedActivityId = String(activity.activity.id);
          sessionStorage.setItem(activityKey, savedActivityId);
        }
        setActivityId(savedActivityId);
      }

      if(me.user.must_change_password){ setPage('change-password'); return; }
      if(me.user.role==='admin'){
        const [a,m,activity]=await Promise.all([
          api('/admin/overview'),
          api('/admin/managers'),
          api('/admin/login-activity')
        ]);
        setAdmin(a); setManagers(m.managers);
        setLoginActivities(activity.activities || []);
      } else {
        const [d,p,history]=await Promise.all([
          api('/employee/dashboard'),
          api('/employee/profile'),
          api('/employee/login-activity/me')
        ]);
        setData(d); setProfile(p.profile);
        setMyLoginActivities(history.activities || []);
        if(history.activities?.[0]?.location_status) setLocationStatus(history.activities[0].location_status);
      }
    } catch(e){
      localStorage.removeItem('vyt_token');
      if(loadedUserId) sessionStorage.removeItem(`vyt_activity_${loadedUserId}`);
      setActivityId(null); setToken(null); setUser(null); setError(e.message);
    }
    finally { setLoading(false); }
  }
  useEffect(()=>{ if(token) load(); else setLoading(false); },[token]);
  useEffect(()=>{ if(!error && !notice) return; const timer=window.setTimeout(()=>{setError('');setNotice('');},4600); return ()=>window.clearTimeout(timer); },[error,notice]);
  async function doLogin(e){
    e.preventDefault(); setError(''); setNotice(''); setLoading(true);
    try { const r=await api('/auth/login',{method:'POST',body:JSON.stringify(login)}); localStorage.setItem('vyt_token',r.token); setToken(r.token); setUser(r.user); setPage(r.user.must_change_password?'change-password':'home'); setNotice('Signed in successfully.'); }
    catch(e){setError(e.message);} finally{setLoading(false);}
  }
  async function logout(){
    try {
      if(user?.role === 'employee' && activityId) {
        await api(`/employee/login-activity/${activityId}/end`, { method: 'POST' });
        sessionStorage.removeItem(`vyt_activity_${user.id}`);
      }
    } catch(e) { console.error('Unable to close login activity:', e); }
    if(user?.id) sessionStorage.removeItem(`vyt_activity_${user.id}`);
    setActivityId(null);
    setNotice('Signed out successfully.'); setError('');
    localStorage.removeItem('vyt_token'); setToken(null); setUser(null);
    setPage('home'); setMenu(false);
  }
  async function changePassword(e){
    e.preventDefault(); setError('');
    if(pw.newPassword!==pw.confirm) return setError('New passwords do not match.');
    try { await api('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:pw.currentPassword,newPassword:pw.newPassword})}); setNotice('Password changed successfully.'); setPw({currentPassword:'',newPassword:'',confirm:''}); await load(); setPage('home'); }
    catch(e){setError(e.message);}
  }
  async function refreshAdmin(){
    const [a,m,activity]=await Promise.all([
      api('/admin/overview'),
      api('/admin/managers'),
      api('/admin/login-activity')
    ]);
    setAdmin(a); setManagers(m.managers);
    setLoginActivities(activity.activities || []);
  }
  async function addEmployee(e){e.preventDefault();setError('');try{const r=await api('/admin/employees',{method:'POST',body:JSON.stringify(employeeForm)});setNotice(`Employee created: ${r.employee.employee_code}`);setEmployeeForm(initialForm);await refreshAdmin();}catch(e){setError(e.message);}}
  async function editEmployee(emp){
    const name=prompt('Employee name',emp.name); if(name===null)return;
    const email=prompt('Work email',emp.email); if(email===null)return;
    const phone=prompt('Phone number',emp.phone); if(phone===null)return;
    const jobTitle=prompt('Role / designation',emp.job_title||'Employee'); if(jobTitle===null)return;
    const dateOfJoining=prompt('Date of joining (YYYY-MM-DD)',String(emp.date_of_joining||'').slice(0,10)); if(dateOfJoining===null)return;
    const dateOfExpiry=prompt('Date of expiry (YYYY-MM-DD, blank for none)',emp.date_of_expiry?String(emp.date_of_expiry).slice(0,10):''); if(dateOfExpiry===null)return;
    try{await api(`/admin/employees/${emp.id}`,{method:'PATCH',body:JSON.stringify({name,email,phone,jobTitle,dateOfJoining,dateOfExpiry:dateOfExpiry||null})});setNotice('Employee details updated.');await refreshAdmin();}catch(e){setError(e.message);}
  }
  async function updateStatus(id,isActive){try{await api(`/admin/employees/${id}/status`,{method:'PATCH',body:JSON.stringify({isActive})});await refreshAdmin();setNotice(isActive?'Employee account activated successfully.':'Employee account suspended successfully.');}catch(e){setError(e.message);}}
  async function removeEmployee(id){if(!confirm('Remove this employee? Their history is retained but they can no longer log in.'))return;try{await api(`/admin/employees/${id}`,{method:'DELETE'});await refreshAdmin();setNotice('Employee account removed successfully.');}catch(e){setError(e.message);}}
  async function addProject(e){e.preventDefault();setError('');try{await api('/admin/projects',{method:'POST',body:JSON.stringify(projectForm)});setProjectForm({projectName:'',description:'',status:'Not Started',startDate:'',deadline:'',managerId:'',employeeIds:[]});setNotice('Project created.');await refreshAdmin();}catch(e){setError(e.message);}}
  async function addManager(e){e.preventDefault();setError('');try{await api('/admin/managers',{method:'POST',body:JSON.stringify(managerForm)});setManagerForm({name:'',roleTitle:'Project Manager',email:'',phone:''});await refreshAdmin();setNotice('Manager added.');}catch(e){setError(e.message);}}
  async function uploadDocument(e){e.preventDefault();setError('');if(!docFile)return setError('Choose a PDF file first.');const fd=new FormData();fd.append('document',docFile);fd.append('documentType',docForm.documentType);fd.append('title',docForm.title);try{await api(`/admin/employees/${docForm.employeeId}/documents`,{method:'POST',body:fd});setNotice('Document uploaded and visible to the employee.');setDocFile(null);await refreshAdmin();}catch(e){setError(e.message);}}
  async function deleteDocument(id){
    if(!window.confirm('Permanently delete this PDF from the employee portal? This action cannot be undone.')) return;
    setError(''); setNotice('');
    try {
      await api(`/admin/documents/${id}`, { method: 'DELETE' });
      setNotice('PDF deleted successfully.');
      await refreshAdmin();
    } catch(e) {
      setError(e.message || 'Unable to delete PDF.');
    }
  }
  async function uploadPhoto(e){const file=e.target.files?.[0];if(!file)return;setError('');const fd=new FormData();fd.append('photo',file);try{await api('/employee/profile/photo',{method:'POST',body:fd});const p=await api('/employee/profile');setProfile(p.profile);setUser({...user,profile_photo:p.profile.profile_photo});setNotice('Profile photo updated.');}catch(e){setError(e.message);}}
  async function uploadVerificationDocument(documentType,file){
    setError(''); setNotice('');
    if(!file) { const message='Please choose a PDF file.'; setError(message); throw new Error(message); }
    if(file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { const message='Only PDF files are allowed.'; setError(message); throw new Error(message); }
    if(file.size>300*1024) { const message='PDF must be 300 KB or smaller.'; setError(message); throw new Error(message); }
    const fd=new FormData(); fd.append('documentType',documentType); fd.append('document',file);
    setVerificationBusy(true);
    try {
      await api('/employee/verification-documents',{method:'POST',body:fd});
      const d=await api('/employee/dashboard'); setData(d);
      setNotice('Verification document uploaded successfully.');
    } catch(e) { setError(e.message); throw e; }
    finally { setVerificationBusy(false); }
  }
  const isAdmin=user?.role==='admin';
  if(loading && !user) return <div className="loading"><div className="spinner"/>Loading Vyntara Portal...</div>;
  if(!token || !user) return <><style>{motionCss}</style><ToastPopup error={error} success={notice}/><Login login={login} setLogin={setLogin} onSubmit={doLogin} error={error} loading={loading}/></>;
  if(user.must_change_password || page==='change-password') return <><style>{motionCss}</style><ToastPopup error={error} success={notice}/><div className="auth-shell"><div className="auth-card"><Brand/><div className="eyebrow">ACCOUNT SECURITY</div><h1>Set your new password</h1><p className="muted">For your security, you must change the temporary password before accessing the portal.</p><form onSubmit={changePassword} className="stack"><Field label="Current temporary password"><input type="password" required value={pw.currentPassword} onChange={e=>setPw({...pw,currentPassword:e.target.value})}/></Field><Field label="New password (minimum 10 characters)"><input type="password" minLength="10" required value={pw.newPassword} onChange={e=>setPw({...pw,newPassword:e.target.value})}/></Field><Field label="Confirm new password"><input type="password" minLength="10" required value={pw.confirm} onChange={e=>setPw({...pw,confirm:e.target.value})}/></Field><button className="primary full">Update password</button></form></div></div></>;
  const nav = isAdmin
    ? [
        {id:'home',label:'Overview',icon:Home},
        {id:'employees',label:'Employees',icon:Users},
        {id:'projects',label:'Projects',icon:FolderKanban},
        {id:'managers',label:'Managers',icon:BriefcaseBusiness},
        {id:'documents',label:'Documents',icon:FileText},
        {id:'payments',label:'Payments',icon:CreditCard},
        {id:'login-activity',label:'Login Activity',icon:History},
        {id:'settings',label:'Settings',icon:Settings}
      ]
    : [
        {id:'home',label:'Home',icon:Home},
        {id:'projects',label:'My Projects',icon:FolderKanban},
        {id:'profile',label:'Profile',icon:UserRound},
        {id:'documents',label:'My Documents',icon:FileText},
        {id:'payments',label:'Portal Fee',icon:CreditCard},
        {id:'login-activity',label:'Login Activity',icon:History},
        {id:'settings',label:'Settings',icon:Settings}
      ];
  return <div className="app-shell"><style>{motionCss}</style><ToastPopup error={error} success={notice}/>
    <header className="topbar"><a className="brand-link" href={homeUrl}><Brand compact/></a><div className="top-actions"><a className="site-link" href={homeUrl} target="_blank" rel="noreferrer">Vyntara website <ExternalLink size={14}/></a><button className="avatar-button" onClick={()=>setPage('profile')}>{user.profile_photo?<ProtectedImage path={`/api/files/profile/${user.id}`} alt={user.name} />:<span>{user.name?.[0]}</span>}</button><button className="mobile-menu" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></header>
    <div className="layout"><aside className={`sidebar ${menu?'open':''}`}><div className="side-user"><div className="avatar">{user.profile_photo?<ProtectedImage path={`/api/files/profile/${user.id}`} alt={user.name} />:user.name?.[0]}</div><div><b>{user.name}</b><small>{isAdmin?'Administrator':user.employee_code}</small></div></div><div className="nav-label">WORKSPACE</div>{nav.map(n=><button key={n.id} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>{setPage(n.id);setMenu(false);setError('');}}><n.icon size={18}/>{n.label}</button>)}<div className="sidebar-bottom"><button className="nav-item" onClick={logout}><LogOut size={18}/>Sign out</button><small>Vyntara Technologies · Employee Portal</small></div></aside>
    <main className="main"><div className="page-heading"><div><div className="eyebrow">{isAdmin?'ADMINISTRATION':'EMPLOYEE WORKSPACE'}</div><h1>{pageTitle(page,isAdmin)}</h1><p>{pageSubtitle(page,isAdmin,user)}</p></div><div className="heading-date"><CalendarDays size={16}/>{new Date().toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</div></div>
      {!isAdmin && activityId && <EmployeeLocationSharing activityId={activityId} onStatus={setLocationStatus}/>}
      {!isAdmin && page==='home' && <EmployeeHome user={user} data={data} setPage={setPage}/>}
      {!isAdmin && page==='projects' && <Projects projects={data.projects}/>}
      {!isAdmin && page==='profile' && <Profile profile={profile} onPhoto={uploadPhoto}/>}
      {!isAdmin && page==='documents' && <Documents documents={data.documents||[]} verificationDocuments={data.verificationDocuments||[]} onUploadVerification={uploadVerificationDocument} busy={verificationBusy}/>}
      {!isAdmin && page==='payments' && <EmployeePayment/>}
      {!isAdmin && page==='login-activity' && <EmployeeLoginActivity activities={myLoginActivities}/>}
      {!isAdmin && page==='settings' && <SettingsPanel onChange={()=>setPage('change-password')}/>}
      {isAdmin && page==='home' && <AdminHome admin={admin} setPage={setPage}/>}
      {isAdmin && page==='employees' && <AdminEmployees employees={admin.employees} form={employeeForm} setForm={setEmployeeForm} onSubmit={addEmployee} onStatus={updateStatus} onRemove={removeEmployee} onEdit={editEmployee} search={search} setSearch={setSearch}/>}
      {isAdmin && page==='projects' && <AdminProjects projects={admin.projects} employees={admin.employees} managers={managers} form={projectForm} setForm={setProjectForm} onSubmit={addProject}/>}
      {isAdmin && page==='managers' && <Managers managers={managers} form={managerForm} setForm={setManagerForm} onSubmit={addManager}/>}
      {isAdmin && page==='documents' && <AdminDocuments docs={admin.documents} employees={admin.employees} form={docForm} setForm={setDocForm} file={docFile} setFile={setDocFile} onSubmit={uploadDocument} onDelete={deleteDocument}/>}
      {isAdmin && page==='payments' && <AdminPayments/>}
      {isAdmin && page==='login-activity' && <AdminLoginActivity activities={loginActivities} onRefresh={refreshAdmin}/>}
      {isAdmin && page==='settings' && <SettingsPanel onChange={()=>setPage('change-password')}/>}
    </main></div>
  </div>;
}

function Brand({compact=false}){return <div className="brand"><div className="brand-mark">V</div>{!compact&&<div><strong>VYNTARA</strong><small>TECHNOLOGIES</small></div>}</div>}
function Login({login,setLogin,onSubmit,error,loading}){return <div className="login-shell"><div className="login-visual"><div className="visual-top"><Brand/><span className="secure"><ShieldCheck size={15}/> SECURE WORKSPACE</span></div><div className="visual-copy"><div className="eyebrow light">PEOPLE · PROJECTS · PROGRESS</div><h1>Great work<br/>starts with a<br/><em>connected team.</em></h1><p>Your work, milestones and people — all in one place.</p><div className="visual-stats"><div><b>01</b><span>One workspace</span></div><div><b>24/7</b><span>Access your updates</span></div><div><b>100%</b><span>Team connected</span></div></div></div><div className="visual-foot">© {new Date().getFullYear()} Vyntara Technologies</div></div><div className="login-panel"><div className="login-form-wrap"><div className="mobile-brand"><Brand/></div><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your portal</h2><p className="muted">Enter the credentials provided by your administrator.</p><form onSubmit={onSubmit} className="stack login-form"><Field label="Work email"><input type="email" placeholder="name@vyntaralabs.tech" required value={login.email} onChange={e=>setLogin({...login,email:e.target.value})}/></Field><Field label="Password"><input type="password" placeholder="Enter your password" required value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/></Field><button className="primary full" disabled={loading}>{loading?'Signing in...':'Sign in securely'} <span>→</span></button></form><div className="login-help"><LockKeyhole size={15}/> Your account is managed by Vyntara Technologies.</div><a className="back-site" href={homeUrl}>← Back to vyntaralabs.tech</a></div></div></div>}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function Notice({error,success}){if(!error&&!success)return null;return <div className={`notice ${error?'error':'success'}`}>{error?<AlertCircle size={16}/>:<CheckCircle2 size={16}/>}<span>{error||success}</span></div>}
function pageTitle(p,a){return ({home:a?'Overview':'Good to see you',employees:'Employee management',projects:a?'Project management':'My projects',profile:'My profile',documents:a?'Document centre':'My documents',payments:a?'Payment management':'Employee Portal Fee',managers:'Team leaders & managers','login-activity':a?'Employee login activity':'My login activity',settings:'Account settings'})[p]||'Account settings'}
function pageSubtitle(p,a,u){return ({home:a?'A live view of your people and project operations.':`Welcome back, ${u?.name?.split(' ')[0]}. Here’s your work at a glance.`,employees:'Create accounts, manage access and review onboarding.',projects:a?'Create projects and assign employees, dates and managers.':'Track your assigned work, milestones and delivery dates.',profile:'Your verified employee information and profile photo.',documents:'Important employment documents, all in one place.',payments:a?'Configure employee portal fees, QR code and verify payment submissions.':'View your portal fee, pay using the admin QR code and submit payment proof.',managers:'Manage the people leading your projects.','login-activity':a?'Review the latest five login sessions and voluntarily shared locations for each employee.':'Review your latest five portal login sessions and any location you chose to share.',settings:'Manage your account security and password.'})[p]||''}
function Stat({label,value,sub,icon:Icon}){return <div className="stat-card"><div className="stat-top"><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{sub}</small></div>}
function EmployeeHome({user,data,setPage}){const active=data.projects.filter(p=>p.status==='In Progress').length;return <><div className="welcome-card"><div><span className="welcome-tag">YOUR WORKSPACE</span><h2>Make today count, {user.name.split(' ')[0]}.</h2><p>Stay focused on your milestones. Your project details and team contacts are ready below.</p></div><div className="welcome-icon"><BriefcaseBusiness size={42}/></div></div><div className="stats-grid"><Stat label="Assigned projects" value={data.projects.length} sub="Across your workspace" icon={FolderKanban}/><Stat label="In progress" value={active} sub="Currently underway" icon={Clock3}/><Stat label="Documents" value={(data.documents||[]).length} sub="Available to view" icon={FileText}/></div><Section title="Your projects" action="View all" onClick={()=>setPage('projects')}/>{data.projects.length?<div className="project-grid">{data.projects.slice(0,3).map(p=><ProjectCard key={p.id} p={p}/>)}</div>:<Empty text="No projects have been assigned to you yet."/>}<Section title="Quick access"/><div className="quick-grid"><Quick icon={UserRound} title="Profile details" desc="View your employee information" onClick={()=>setPage('profile')}/><Quick icon={Award} title="Certificates & letters" desc="Access your employment documents" onClick={()=>setPage('documents')}/><Quick icon={Settings} title="Account settings" desc="Update your password" onClick={()=>setPage('settings')}/></div></>}
function Section({title,action,onClick}){return <div className="section-head"><h3>{title}</h3>{action&&<button className="text-button" onClick={onClick}>{action} →</button>}</div>}
function ProjectCard({p}){return <div className="project-card"><div className="project-card-top"><span className="project-icon"><FolderKanban size={19}/></span><Status value={p.status}/></div><h3>{p.project_name}</h3><p>{p.description||'Project assignment and delivery milestones.'}</p><div className="project-dates"><div><small>START DATE</small><b>{date(p.start_date)}</b></div><div><small>DEADLINE</small><b>{date(p.deadline)}</b></div></div><div className="manager-line"><div className="mini-avatar">{p.manager_name?.[0]||'M'}</div><div><b>{p.manager_name||'Not assigned'}</b><small>{p.manager_role||'Project Manager'}</small></div><span className="manager-contact">{p.manager_email||''}<br/>{p.manager_phone||''}</span></div></div>}
function Status({value}){return <span className={`status ${String(value).toLowerCase().replaceAll(' ','-')}`}>{value}</span>}
function Projects({projects}){return <>{projects.length?<div className="project-grid">{projects.map(p=><ProjectCard key={p.id} p={p}/>)}</div>:<Empty text="Your project assignments will appear here once your manager adds you to a project."/>}</>}
function Profile({profile,onPhoto}){if(!profile)return <Empty text="Profile is loading."/>;return <div className="content-card profile-card"><div className="profile-cover"/><div className="profile-main"><div className="profile-photo">{profile.profile_photo?<ProtectedImage path={`/api/files/profile/${profile.id}`} alt={profile.name} />:profile.name?.[0]}<label className="photo-edit"><Camera size={15}/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhoto}/></label></div><div><h2>{profile.name}</h2><p>{profile.job_title||'Employee'} · {profile.employee_code}</p></div><span className="verified"><ShieldCheck size={15}/> Verified profile</span></div><div className="profile-fields"><ReadOnly label="Full name" value={profile.name}/><ReadOnly label="Work email" value={profile.email}/><ReadOnly label="Phone number" value={profile.phone}/><ReadOnly label="Employee code" value={profile.employee_code}/><ReadOnly label="Date of joining" value={date(profile.date_of_joining)}/><ReadOnly label="Date of expiry" value={date(profile.date_of_expiry)}/></div><p className="profile-note"><LockKeyhole size={15}/> Your name, email, phone number and employee code are verified by HR and cannot be edited here. You can update only your profile photo.</p></div>}
function ReadOnly({label,value}){return <div className="readonly"><small>{label}</small><b>{value||'—'}</b></div>}
function Documents({documents=[],verificationDocuments=[],onUploadVerification,busy=false}){
  const groups=[['offer_letter','Offer letters'],['completion_certificate','Completion certificates'],['recommendation_letter','Letters of recommendation'],['certificate','Certificates'],['other','Other documents']];
  const required=[['identity_proof','Identity proof'],['educational_proof','Educational proof'],['residential_proof','Residential proof']];
  return <div className="document-groups">
    <div className="content-card form-card">
      <div className="card-title"><div><h3><ShieldCheck size={18}/> Mandatory verification documents</h3><p>Upload all three documents as PDF files. Maximum file size: 300 KB per document.</p></div></div>
      <div className="verification-grid">{required.map(([type,label])=>{
        const uploaded=verificationDocuments.find(d=>d.document_type===type);
        return <VerificationUploadCard key={type} type={type} label={label} uploaded={uploaded} onUpload={onUploadVerification} busy={busy}/>;
      })}</div>
      <p className="muted tiny">Your documents are private and can be viewed only by you and authorized administrators.</p>
    </div>
    {groups.map(([type,label])=>{const list=documents.filter(d=>d.document_type===type);return <div className="content-card doc-group" key={type}><div className="doc-group-title"><span className="doc-icon"><FileText/></span><div><h3>{label}</h3><small>{list.length} document{list.length===1?'':'s'}</small></div></div>{list.length?list.map(d=><DocumentRow key={d.id} d={d}/>):<p className="empty-inline">No documents uploaded yet.</p>}</div>})}
  </div>;
}
function VerificationUploadCard({type,label,uploaded,onUpload,busy}){
  const [file,setFile]=useState(null); const [localError,setLocalError]=useState('');
  async function submit(e){e.preventDefault();setLocalError('');if(!file){setLocalError('Choose a PDF file first.');return;}try{await onUpload(type,file);setFile(null);e.target.reset();}catch(error){setLocalError(error.message||'Upload failed.');}}
  return <div className="verification-card">
    <div className="verification-card-head"><div className="doc-icon"><FileText/></div><div><h4>{label}</h4><span className={uploaded?'status completed':'status pending'}>{uploaded?'Uploaded':'Required'}</span></div></div>
    {uploaded&&<div className="verification-uploaded"><CheckCircle2 size={15}/><span>{uploaded.file_name||uploaded.title||'PDF uploaded'} · {date(uploaded.uploaded_at)}</span></div>}
    <form onSubmit={submit} className="verification-form"><input type="file" accept="application/pdf,.pdf" onChange={e=>{setFile(e.target.files?.[0]||null);setLocalError('');}}/><small>PDF only · Up to 300 KB</small>{localError&&<small className="field-error">{localError}</small>}<button className="secondary" type="submit" disabled={busy}>{busy?'Uploading...':uploaded?'Replace PDF':'Upload PDF'} <Upload size={15}/></button></form>
    {uploaded&&<DocumentRow d={uploaded}/>}
  </div>;
}
function DocumentRow({ d, onDelete }) {
  const documentPath =
    typeof d?.document_url === 'string' && d.document_url
      ? d.document_url
      : typeof d?.storage_path === 'string' && d.storage_path.startsWith('/api/')
        ? d.storage_path
        : d?.id
          ? `/api/files/document/${encodeURIComponent(d.id)}`
          : '';

  async function handleView() {
    if (!documentPath) {
      alert('The document file path is missing. Please contact your administrator.');
      return;
    }
    try {
      await openAuthenticatedDocument(documentPath);
    } catch (error) {
      alert(error.message || 'Unable to open document.');
    }
  }

  return (
    <div className="document-row">
      <div className="pdf-icon">PDF</div>
      <div className="doc-info">
        <b>{d?.title || 'Untitled document'}</b>
        <small>{d?.file_name || 'PDF document'} · {date(d?.uploaded_at)}</small>
      </div>
      {documentPath ? (
        <button type="button" className="download" onClick={handleView}>
          View <ExternalLink size={14} />
        </button>
      ) : <span className="muted tiny">File unavailable</span>}
      {typeof onDelete === 'function' && (
        <button type="button" className="row-delete-button" title="Delete PDF (admin only)" onClick={() => onDelete(d.id)}>
          <Trash2 size={15}/> Delete
        </button>
      )}
    </div>
  );
}
function SettingsPanel({onChange}){return <div className="content-card setting-card"><div className="setting-icon"><LockKeyhole/></div><div className="setting-copy"><h3>Password & security</h3><p>Change your portal password. Use a unique password with at least 10 characters.</p></div><button className="secondary" onClick={onChange}>Change password</button></div>}
function Quick({icon:Icon,title,desc,onClick}){return <button className="quick-card" onClick={onClick}><Icon/><div><b>{title}</b><small>{desc}</small></div><span>→</span></button>}
function Empty({text}){return <div className="empty-state"><div><FolderKanban size={24}/></div><b>Nothing to show yet</b><p>{text}</p></div>}
function AdminHome({admin,setPage}){const active=admin.employees.filter(e=>e.is_active).length;return <><div className="welcome-card admin-welcome"><div><span className="welcome-tag">ADMIN CONTROL CENTRE</span><h2>People operations, in control.</h2><p>Manage employee access, project delivery and official documents from one workspace.</p></div><div className="welcome-icon"><ShieldCheck size={42}/></div></div><div className="stats-grid"><Stat label="Total employees" value={admin.employees.length} sub="Registered employee accounts" icon={Users}/><Stat label="Active accounts" value={active} sub={`${admin.employees.length-active} inactive or suspended`} icon={CheckCircle2}/><Stat label="Projects" value={admin.projects.length} sub="Managed assignments" icon={FolderKanban}/><Stat label="Documents" value={admin.documents.length} sub="Latest uploaded documents" icon={FileText}/></div><div className="admin-shortcuts"><Quick icon={Plus} title="Add employee" desc="Create an employee login" onClick={()=>setPage('employees')}/><Quick icon={FolderKanban} title="Create project" desc="Assign dates, manager and team" onClick={()=>setPage('projects')}/><Quick icon={Upload} title="Upload documents" desc="Add letters and certificates" onClick={()=>setPage('documents')}/></div><Section title="Recent employees" action="Manage employees" onClick={()=>setPage('employees')}/><EmployeeTable employees={admin.employees.slice(0,5)} compact/></>}
function AdminEmployees({employees,form,setForm,onSubmit,onStatus,onRemove,onEdit,search,setSearch}){const filtered=employees.filter(e=>`${e.name} ${e.email} ${e.employee_code}`.toLowerCase().includes(search.toLowerCase()));return <><div className="content-card form-card"><div className="card-title"><div><h3><Plus size={18}/> Add new employee</h3><p>Employee code is generated automatically. Joining date is required.</p></div></div><form onSubmit={onSubmit} className="form-grid"><Field label="Employee full name"><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Work email"><input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field><Field label="Phone number"><input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field><Field label="Temporary password"><input type="password" minLength="10" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field><Field label="Role / designation"><input required value={form.jobTitle} onChange={e=>setForm({...form,jobTitle:e.target.value})}/></Field><Field label="Date of joining"><input type="date" required value={form.dateOfJoining} onChange={e=>setForm({...form,dateOfJoining:e.target.value})}/></Field><Field label="Date of expiry (optional)"><input type="date" value={form.dateOfExpiry} onChange={e=>setForm({...form,dateOfExpiry:e.target.value})}/></Field><div className="form-end"><span className="muted tiny">First login will require a password change.</span><button className="primary"><Plus size={16}/> Create employee</button></div></form></div><div className="section-head"><h3>Employee directory <span className="count">{employees.length}</span></h3><div className="searchbox"><Search size={16}/><input placeholder="Search name, email or code" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><EmployeeTable employees={filtered} onStatus={onStatus} onRemove={onRemove} onEdit={onEdit}/></>}
function EmployeeTable({employees,onStatus,onRemove,onEdit,compact=false}){return <div className="table-wrap"><table><thead><tr><th>EMPLOYEE</th><th>CODE</th><th>JOINED</th><th>FIRST LOGIN PASSWORD</th><th>STATUS</th>{!compact&&<th>ACTIONS</th>}</tr></thead><tbody>{employees.map(e=><tr key={e.id}><td><b>{e.name}</b><small>{e.email}</small></td><td><span className="code-pill">{e.employee_code}</span></td><td>{date(e.date_of_joining)}</td><td>{e.must_change_password?<span className="status pending">Pending</span>:<span className="status completed">Changed</span>}</td><td><span className={`status ${e.is_active?'completed':'suspended'}`}>{e.is_active?'Active':'Suspended'}</span></td>{!compact&&<td><div className="row-actions"><button title="Edit employee details" onClick={()=>onEdit(e)}><UserRound size={15}/></button><button title={e.is_active?'Suspend':'Activate'} onClick={()=>onStatus(e.id,!e.is_active)}><Power size={15}/></button><button className="danger-icon" title="Remove" onClick={()=>onRemove(e.id)}><Trash2 size={15}/></button></div></td>}</tr>)}</tbody></table>{!employees.length&&<Empty text="No employees match your search."/>}</div>}
function AdminProjects({projects,employees,managers,form,setForm,onSubmit}){return <><div className="content-card form-card"><div className="card-title"><div><h3><Plus size={18}/> Create project</h3><p>Set project ownership, dates and employee assignments.</p></div></div><form onSubmit={onSubmit} className="form-grid"><Field label="Project name"><input required value={form.projectName} onChange={e=>setForm({...form,projectName:e.target.value})}/></Field><Field label="Project status"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{['Not Started','In Progress','On Hold','Completed','Cancelled'].map(s=><option>{s}</option>)}</select></Field><Field label="Start date"><input type="date" required value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></Field><Field label="Deadline"><input type="date" required value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></Field><Field label="Project manager / team leader"><select value={form.managerId} onChange={e=>setForm({...form,managerId:e.target.value})}><option value="">Select manager</option>{managers.map(m=><option value={m.id}>{m.name} — {m.role_title}</option>)}</select></Field><Field label="Assign employees"><select multiple value={form.employeeIds} onChange={e=>setForm({...form,employeeIds:[...e.target.selectedOptions].map(o=>o.value)})}>{employees.filter(e=>e.is_active).map(e=><option value={e.id}>{e.name} ({e.employee_code})</option>)}</select></Field><Field label="Description"><textarea rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field><div className="form-end"><span className="muted tiny">Hold Ctrl/Cmd to select multiple employees.</span><button className="primary"><Plus size={16}/> Save project</button></div></form></div><Section title="All projects"/><div className="project-grid">{projects.map(p=><div className="project-card" key={p.id}><div className="project-card-top"><span className="project-icon"><FolderKanban/></span><Status value={p.status}/></div><h3>{p.project_name}</h3><p>{p.description||'No description added.'}</p><div className="project-dates"><div><small>START DATE</small><b>{date(p.start_date)}</b></div><div><small>DEADLINE</small><b>{date(p.deadline)}</b></div></div><div className="manager-line"><div className="mini-avatar">{p.manager_name?.[0]||'?'}</div><div><b>{p.manager_name||'No manager'}</b><small>Project manager</small></div></div></div>)}{!projects.length&&<Empty text="No projects created yet."/>}</div></>}
function Managers({managers,form,setForm,onSubmit}){return <><div className="content-card form-card"><div className="card-title"><div><h3><Plus size={18}/> Add manager / team leader</h3><p>These details appear on employee project cards.</p></div></div><form className="form-grid" onSubmit={onSubmit}><Field label="Full name"><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Role / designation"><input required value={form.roleTitle} onChange={e=>setForm({...form,roleTitle:e.target.value})}/></Field><Field label="Work email"><input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field><Field label="Contact number"><input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field><div className="form-end"><span/><button className="primary"><Plus size={16}/> Add manager</button></div></form></div><div className="manager-grid">{managers.map(m=><div className="content-card manager-card"><div className="manager-avatar">{m.name[0]}</div><h3>{m.name}</h3><span className="role-chip">{m.role_title}</span><p>{m.email}</p><p>{m.phone}</p></div>)}{!managers.length&&<Empty text="Add a project manager or team leader to get started."/>}</div></>}
function AdminDocuments({docs,employees,form,setForm,file,setFile,onSubmit,onDelete}){
  return <>
    <div className="content-card form-card">
      <div className="card-title"><div><h3><Upload size={18}/> Upload employee document</h3><p>Upload a PDF (maximum 10 MB). It becomes available in that employee's portal.</p></div></div>
      <form onSubmit={onSubmit} className="form-grid">
        <Field label="Employee"><select required value={form.employeeId} onChange={e=>setForm({...form,employeeId:e.target.value})}><option value="">Choose employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>)}</select></Field>
        <Field label="Document category"><select value={form.documentType} onChange={e=>setForm({...form,documentType:e.target.value})}><option value="offer_letter">Offer letter</option><option value="completion_certificate">Completion certificate</option><option value="recommendation_letter">Letter of recommendation</option><option value="certificate">Certificate</option><option value="other">Other</option></select></Field>
        <Field label="Document title"><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
        <Field label="PDF file"><input type="file" accept="application/pdf,.pdf" required onChange={e=>setFile(e.target.files?.[0]||null)}/></Field>
        <div className="form-end"><span className="muted tiny">{file?.name||'No file selected'}</span><button className="primary"><Upload size={16}/> Upload document</button></div>
      </form>
    </div>
    <Section title="Employee uploaded documents"/>
    <div className="content-card">
      {docs.length ? docs.map(d=><div className="admin-document-item" key={d.id}>
        <div className="admin-document-employee"><b>{d.employee_name || 'Employee'}</b><small>{d.employee_code || '—'} · {(d.document_type || 'document').replaceAll('_',' ')}</small></div>
        <DocumentRow d={d} onDelete={onDelete}/>
      </div>) : <Empty text="No employee documents have been uploaded yet."/>}
    </div>
  </>;
}

function EmployeeLoginActivity({activities=[]}){
  function dateTime(value){
    if(!value) return '—';
    return new Date(value).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});
  }
  function statusLabel(status){
    return ({not_asked:'Not requested',denied:'Permission denied',unavailable:'Location unavailable',shared:'Location shared',stopped:'Sharing stopped'})[status] || status || 'Unknown';
  }
  const records=[...activities].sort((a,b)=>new Date(b.logged_in_at)-new Date(a.logged_in_at)).slice(0,5);
  return <div className="login-activity-page">
    <div className="content-card activity-intro">
      <div className="activity-intro-icon"><History size={24}/></div>
      <div><h3>Your login history</h3><p>Your latest five recorded portal sessions. Your location appears only for sessions where you enabled browser location sharing.</p></div>
    </div>
    {!records.length ? <Empty text="Your login history will appear here after your next sign-in."/> :
      <div className="content-card activity-employee-card">
        <div className="activity-table-wrap"><table><thead><tr><th>LOGIN DATE &amp; TIME</th><th>SESSION STATUS</th><th>LOCATION STATUS</th><th>LAST LOCATION UPDATE</th><th>GPS LOCATION</th></tr></thead><tbody>
          {records.map(record=><tr key={record.activity_id || record.id}>
            <td><b>{dateTime(record.logged_in_at)}</b></td>
            <td>{record.ended_at ? `Ended ${dateTime(record.ended_at)}` : 'Current / end not recorded'}</td>
            <td><span className={`status ${record.location_status==='shared'?'completed':'pending'}`}>{statusLabel(record.location_status)}</span></td>
            <td>{dateTime(record.location_updated_at)}</td>
            <td>{record.latitude != null && record.longitude != null ?
              <a className="activity-map-link" href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`} target="_blank" rel="noreferrer"><MapPin size={15}/> View my shared location <ExternalLink size={13}/></a> :
              <span className="muted tiny">Not shared</span>}</td>
          </tr>)}
        </tbody></table></div>
      </div>}
  </div>;
}

function AdminLoginActivity({activities=[],onRefresh}){
  const employees=[...new Map(activities.map(item=>[item.employee_id,{id:item.employee_id,name:item.employee_name,code:item.employee_code,email:item.email,jobTitle:item.job_title}])).values()];
  function dateTime(value){
    if(!value) return '—';
    return new Date(value).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});
  }
  function statusLabel(status){
    return ({not_asked:'Not requested',denied:'Permission denied',unavailable:'Location unavailable',shared:'Location shared',stopped:'Sharing stopped'})[status] || status || 'Unknown';
  }
  return <div className="login-activity-page">
    <div className="content-card activity-intro">
      <div className="activity-intro-icon"><History size={24}/></div>
      <div><h3>Employee login history</h3><p>Showing the latest five recorded login sessions per employee. GPS is displayed only when an employee enables location sharing.</p></div>
      <button className="secondary activity-refresh" type="button" onClick={onRefresh}><RefreshCw size={15}/> Refresh</button>
    </div>
    {!employees.length ? <Empty text="No employee login activity has been recorded yet."/> : employees.map(employee=>{
      const records=activities.filter(a=>a.employee_id===employee.id).sort((a,b)=>new Date(b.logged_in_at)-new Date(a.logged_in_at)).slice(0,5);
      return <div className="content-card activity-employee-card" key={employee.id}>
        <div className="activity-employee-heading">
          <div className="activity-avatar">{employee.name?.[0] || 'E'}</div>
          <div><h3>{employee.name}</h3><p>{employee.code} · {employee.email}</p><small>{employee.jobTitle || 'Employee'}</small></div>
          <span className="count">{records.length} / 5 logins</span>
        </div>
        <div className="activity-table-wrap"><table><thead><tr><th>LOGIN DATE &amp; TIME</th><th>LOCATION STATUS</th><th>LAST LOCATION UPDATE</th><th>GPS LOCATION</th></tr></thead><tbody>
          {records.map(record=><tr key={record.activity_id}>
            <td><b>{dateTime(record.logged_in_at)}</b><small>{record.ended_at ? `Session ended: ${dateTime(record.ended_at)}` : 'Session end not recorded'}</small></td>
            <td><span className={`status ${record.location_status==='shared'?'completed':'pending'}`}>{statusLabel(record.location_status)}</span></td>
            <td>{dateTime(record.location_updated_at)}</td>
            <td>{record.latitude != null && record.longitude != null ? <a className="activity-map-link" href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`} target="_blank" rel="noreferrer"><MapPin size={15}/> View map <ExternalLink size={13}/></a> : <span className="muted tiny">Not available</span>}</td>
          </tr>)}
        </tbody></table></div>
      </div>;
    })}
  </div>;
}

function EmployeeLocationSharing({activityId,onStatus}){
  // Request the browser's native location permission automatically when the
  // authenticated employee portal session becomes available. No custom card,
  // button, status text, or IP-based location lookup is rendered.
  useEffect(()=>{
    if(!activityId) return;
    let active=true;
    let sharing=true;
    let requestInProgress=false;

    const saveStatus=async status=>{
      if(!active) return;
      onStatus(status);
      try{
        await api(`/employee/login-activity/${activityId}/location-status`,{
          method:'PATCH',
          body:JSON.stringify({status})
        });
      }catch(error){
        console.error('Unable to save browser location status:',error);
      }
    };

    const requestLocation=()=>{
      if(!active || !sharing || requestInProgress || document.visibilityState!=='visible') return;
      if(!navigator.geolocation){
        sharing=false;
        saveStatus('unavailable');
        return;
      }

      requestInProgress=true;
      navigator.geolocation.getCurrentPosition(async position=>{
        try{
          if(!active || !sharing) return;
          const coords=position.coords;
          await api(`/employee/login-activity/${activityId}/location`,{
            method:'POST',
            body:JSON.stringify({
              latitude:coords.latitude,
              longitude:coords.longitude,
              accuracy:coords.accuracy
            })
          });
          if(active && sharing) onStatus('shared');
        }catch(error){
          console.error('Unable to save employee location:',error);
        }finally{
          requestInProgress=false;
        }
      },error=>{
        requestInProgress=false;
        if(!active) return;
        const status=error.code===1?'denied':'unavailable';
        if(error.code===1) sharing=false;
        saveStatus(status);
      },{
        enableHighAccuracy:true,
        timeout:30000,
        maximumAge:0
      });
    };

    // Calling the Geolocation API triggers the browser's own Allow / Block
    // permission prompt when the site has not been granted a decision yet.
    requestLocation();
    const timer=window.setInterval(requestLocation,5*60*1000);
    const onVisibilityChange=()=>{
      if(document.visibilityState==='visible') requestLocation();
    };
    document.addEventListener('visibilitychange',onVisibilityChange);

    return ()=>{
      active=false;
      sharing=false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisibilityChange);
    };
  },[activityId,onStatus]);

  return null;
}
