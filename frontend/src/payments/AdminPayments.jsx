
import React, {
  useCallback,
  useEffect,
  useState
} from 'react';

import {
  api,
  API,
  getToken
} from '../api';

import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Upload,
  Save,
  CreditCard,
  Image as ImageIcon
} from 'lucide-react';

const money = value =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(value || 0));

/*
|--------------------------------------------------------------------------
| LOAD AUTHENTICATED SCREENSHOT
|--------------------------------------------------------------------------
*/

async function loadScreenshot(id) {
  const response = await fetch(
    `${API}/payments/admin/submissions/${id}/screenshot`,
    {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      'Unable to load payment screenshot.'
    );
  }

  const blob = await response.blob();

  return URL.createObjectURL(blob);
}

/*
|--------------------------------------------------------------------------
| ADMIN PAYMENTS COMPONENT
|--------------------------------------------------------------------------
*/

export default function AdminPayments() {

  const [settings, setSettings] = useState({
    fee_items: [
      {
        label: 'Employee Portal Fee',
        amount: 149
      }
    ],
    total_amount: 149,
    upi_id: '',
    qr_url: null
  });

  const [payments, setPayments] = useState([]);

  const [filter, setFilter] = useState('pending');

  const [qrFile, setQrFile] = useState(null);

  const [screenshots, setScreenshots] = useState({});

  const [notes, setNotes] = useState({});

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState('');

  const [notice, setNotice] = useState('');

  /*
  |--------------------------------------------------------------------------
  | CALCULATE TOTAL
  |--------------------------------------------------------------------------
  */

  const total = (
    settings.fee_items || []
  ).reduce(
    (sum, item) =>
      sum + (Number(item.amount) || 0),
    0
  );

  /*
  |--------------------------------------------------------------------------
  | LOAD SETTINGS AND SUBMISSIONS
  |--------------------------------------------------------------------------
  */

  const refresh = useCallback(async () => {
    try {
      const [settingsResponse, paymentResponse] =
        await Promise.all([
          api('/payments/settings'),

          api(
            `/payments/admin/submissions?status=${filter}`
          )
        ]);

      setSettings(settingsResponse.settings);

      setPayments(
        paymentResponse.payments || []
      );

      setError('');

    } catch (error) {
      setError(
        error.message || 'Unable to load payment data.'
      );
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /*
  |--------------------------------------------------------------------------
  | UPDATE FEE ITEM
  |--------------------------------------------------------------------------
  */

  function updateItem(index, field, value) {
    setSettings(current => ({
      ...current,

      fee_items: current.fee_items.map(
        (item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [field]: value
              }
            : item
      )
    }));
  }

  /*
  |--------------------------------------------------------------------------
  | SAVE PAYMENT SETTINGS
  |--------------------------------------------------------------------------
  */

  async function saveSettings(event) {
    event.preventDefault();

    setBusy(true);
    setError('');
    setNotice('');

    try {
      const feeItems = settings.fee_items.map(
        item => ({
          label: item.label,
          amount: Number(item.amount)
        })
      );

      const result = await api(
        '/payments/admin/settings',
        {
          method: 'PUT',

          body: JSON.stringify({
            feeItems,
            upiId: settings.upi_id
          })
        }
      );

      setSettings(result.settings);

      setNotice(
        'Payment fee settings saved successfully.'
      );

    } catch (error) {
      setError(
        error.message || 'Unable to save payment settings.'
      );

    } finally {
      setBusy(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | UPLOAD QR CODE
  |--------------------------------------------------------------------------
  */

  async function uploadQr(event) {
    event.preventDefault();

    if (!qrFile) {
      setError('Choose a QR image first.');
      return;
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(qrFile.type)) {
      setError('Choose a JPG, PNG or WEBP QR image.');
      return;
    }

    if (qrFile.size > 5 * 1024 * 1024) {
      setError('QR image must be 5 MB or smaller.');
      return;
    }

    const body = new FormData();

    body.append('qr', qrFile);

    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result = await api(
        '/payments/admin/settings/qr',
        {
          method: 'POST',
          body
        }
      );

      setSettings(current => ({
        ...current,
        qr_url: result.qrUrl
      }));

      setQrFile(null);

      setNotice(
        'UPI QR code updated successfully.'
      );

    } catch (error) {
      setError(
        error.message || 'Unable to upload QR code.'
      );

    } finally {
      setBusy(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | APPROVE OR REJECT PAYMENT
  |--------------------------------------------------------------------------
  */

  async function review(payment, status) {
    const adminNote = (
      notes[payment.id] || ''
    ).trim();

    if (status === 'rejected' && !adminNote) {
      setError(
        'Enter a reason before rejecting a payment.'
      );

      return;
    }

    if (
      status === 'approved' &&
      !window.confirm(
        `Confirm that ${money(payment.amount)} has been received and approve this payment?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');

    try {
      await api(
        `/payments/admin/submissions/${payment.id}/review`,
        {
          method: 'PATCH',

          body: JSON.stringify({
            status,
            adminNote
          })
        }
      );

      setNotice(
        `Payment ${status} successfully.`
      );

      await refresh();

    } catch (error) {
      setError(
        error.message || 'Unable to update payment.'
      );

    } finally {
      setBusy(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | VIEW PAYMENT SCREENSHOT
  |--------------------------------------------------------------------------
  */

  async function viewScreenshot(payment) {
    try {
      if (screenshots[payment.id]) {
        window.open(
          screenshots[payment.id],
          '_blank',
          'noopener,noreferrer'
        );

        return;
      }

      const url = await loadScreenshot(payment.id);

      setScreenshots(current => ({
        ...current,
        [payment.id]: url
      }));

      window.open(
        url,
        '_blank',
        'noopener,noreferrer'
      );

    } catch (error) {
      setError(
        error.message || 'Unable to view screenshot.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CLEAN UP BLOB URLS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    return () => {
      Object.values(screenshots).forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, [screenshots]);

  /*
  |--------------------------------------------------------------------------
  | RENDER ADMIN PAGE
  |--------------------------------------------------------------------------
  */

  return (
    <div className="payment-admin">

      {/* ALERTS */}

      {error && (
        <div className="notice error">
          {error}
        </div>
      )}

      {notice && (
        <div className="notice success">
          {notice}
        </div>
      )}

      {/* PAYMENT CONFIGURATION */}

      <section className="content-card payment-card">

        <div className="payment-heading">

          <div>
            <span className="eyebrow">
              ADMIN CONTROLS
            </span>

            <h2>Payment configuration</h2>

            <p className="muted">
              Manage employee fee breakdown and UPI
              payment details.
            </p>
          </div>

          <CreditCard size={25} />

        </div>

        {/* FEE SETTINGS */}

        <form onSubmit={saveSettings}>

          <div className="payment-admin-items">

            {(settings.fee_items || []).map(
              (item, index) => (

                <div
                  className="payment-admin-item"
                  key={index}
                >

                  <label className="field">

                    <span>Fee item</span>

                    <input
                      value={item.label}
                      onChange={event =>
                        updateItem(
                          index,
                          'label',
                          event.target.value
                        )
                      }
                      required
                      maxLength={100}
                    />

                  </label>

                  <label className="field">

                    <span>Amount (₹)</span>

                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      value={item.amount}
                      onChange={event =>
                        updateItem(
                          index,
                          'amount',
                          event.target.value
                        )
                      }
                      required
                    />

                  </label>

                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label="Remove fee item"
                    onClick={() =>
                      setSettings(current => ({
                        ...current,

                        fee_items:
                          current.fee_items.filter(
                            (_, itemIndex) =>
                              itemIndex !== index
                          )
                      }))
                    }
                  >
                    ×
                  </button>

                </div>

              )
            )}

          </div>

          {/* ADD FEE ITEM */}

          <button
            type="button"
            className="secondary"
            disabled={
              (settings.fee_items || []).length >= 20
            }
            onClick={() =>
              setSettings(current => ({
                ...current,

                fee_items: [
                  ...current.fee_items,
                  {
                    label: '',
                    amount: 0
                  }
                ]
              }))
            }
          >
            + Add fee item
          </button>

          {/* UPI ID */}

          <label className="field payment-upi-field">

            <span>UPI ID</span>

            <input
              value={settings.upi_id || ''}
              onChange={event =>
                setSettings(current => ({
                  ...current,
                  upi_id: event.target.value
                }))
              }
              placeholder="yourname@upi"
              maxLength={255}
            />

          </label>

          {/* TOTAL */}

          <div className="payment-total compact">

            <span>Total payable (calculated)</span>

            <strong>{money(total)}</strong>

          </div>

          {/* SAVE */}

          <button
            className="primary"
            disabled={
              busy ||
              !settings.fee_items?.length ||
              settings.fee_items.some(
                item =>
                  !String(item.label || '').trim() ||
                  !Number.isFinite(Number(item.amount)) ||
                  Number(item.amount) < 0
              )
            }
          >
            <Save size={16} />

            {busy
              ? 'Saving…'
              : 'Save payment settings'}
          </button>

        </form>

        {/* QR CODE SETTINGS */}

        <div className="payment-qr-admin">

          <div>

            <h3>UPI QR code</h3>

            <p className="muted small">
              This QR code is visible to authenticated
              employees on their payment page.
            </p>

          </div>

          {settings.qr_url && (
            <img
              className="payment-qr-thumb"
              src={settings.qr_url}
              alt="Current UPI QR"
            />
          )}

          <form
            onSubmit={uploadQr}
            className="qr-upload-form"
          >

            <label className="field">

              <span>Upload QR image</span>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event =>
                  setQrFile(
                    event.target.files?.[0] || null
                  )
                }
                required
              />

            </label>

            <button
              className="secondary"
              disabled={busy || !qrFile}
            >
              <Upload size={15} />

              {busy
                ? 'Uploading…'
                : 'Upload QR'}
            </button>

          </form>

        </div>

      </section>

      {/* EMPLOYEE PAYMENT SUBMISSIONS */}

      <section className="content-card payment-card">

        <div className="payment-heading">

          <div>
            <span className="eyebrow">
              PAYMENT REVIEW
            </span>

            <h2>Employee submissions</h2>

            <p className="muted">
              Verify the actual UPI receipt before
              approving.
            </p>
          </div>

          <button
            className="secondary"
            onClick={refresh}
            type="button"
          >
            <RefreshCw size={15} />
            Refresh
          </button>

        </div>

        {/* FILTER */}

        <div className="payment-filter">

          {[
            'pending',
            'approved',
            'rejected'
          ].map(status => (

            <button
              key={status}
              type="button"
              className={
                filter === status ? 'active' : ''
              }
              onClick={() => setFilter(status)}
            >
              {status.charAt(0).toUpperCase() +
                status.slice(1)}
            </button>

          ))}

        </div>

        {/* EMPTY STATE */}

        {!payments.length ? (

          <div className="empty-state">

            <ImageIcon size={25} />

            <p>
              No {filter} payments found.
            </p>

          </div>

        ) : (

          <div className="payment-submissions">

            {payments.map(payment => (

              <article
                className="payment-submission"
                key={payment.id}
              >

                {/* EMPLOYEE DETAILS */}

                <div className="payment-submission-head">

                  <div>

                    <strong>
                      {payment.employee_name}
                    </strong>

                    <p>
                      {payment.employee_code}
                      {' · '}
                      {payment.email}
                    </p>

                  </div>

                  <span
                    className={`payment-pill ${payment.status}`}
                  >
                    {payment.status}
                  </span>

                </div>

                {/* PAYMENT AMOUNT */}

                <div className="payment-meta">

                  <span>Amount</span>

                  <b>
                    {money(payment.amount)}
                  </b>

                </div>

                {/* FEE SNAPSHOT */}

                {(payment.fee_items_snapshot || []).map(
                  (item, index) => (

                    <div
                      className="payment-meta small"
                      key={index}
                    >

                      <span>{item.label}</span>

                      <span>
                        {money(item.amount)}
                      </span>

                    </div>

                  )
                )}

                {/* TRANSACTION REFERENCE */}

                <div className="payment-meta">

                  <span>Transaction / UTR</span>

                  <b>
                    {payment.transaction_reference ||
                      'Not provided'}
                  </b>

                </div>

                {/* SUBMISSION DATE */}

                <div className="payment-meta">

                  <span>Submitted</span>

                  <span>
                    {new Date(
                      payment.submitted_at
                    ).toLocaleString('en-IN')}
                  </span>

                </div>

                {/* SCREENSHOT */}

                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    viewScreenshot(payment)
                  }
                >
                  <ImageIcon size={15} />
                  View screenshot
                </button>

                {/* APPROVAL / REJECTION */}

                {payment.status === 'pending' && (

                  <>

                    <label className="field">

                      <span>
                        Admin note (required for rejection)
                      </span>

                      <input
                        value={
                          notes[payment.id] || ''
                        }
                        onChange={event =>
                          setNotes(current => ({
                            ...current,
                            [payment.id]: event.target.value
                          }))
                        }
                        placeholder="Reason for rejection, if any"
                        maxLength={1000}
                      />

                    </label>

                    <div className="payment-review-actions">

                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          review(payment, 'approved')
                        }
                      >
                        <CheckCircle2 size={15} />
                        Approve
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        disabled={busy}
                        onClick={() =>
                          review(payment, 'rejected')
                        }
                      >
                        <XCircle size={15} />
                        Reject
                      </button>

                    </div>

                  </>

                )}

                {/* ADMIN NOTE */}

                {payment.admin_note && (

                  <p className="muted small">
                    Admin note: {payment.admin_note}
                  </p>

                )}

                {/* REVIEWER */}

                {payment.reviewed_by_name && (

                  <p className="muted small">
                    Reviewed by: {payment.reviewed_by_name}
                  </p>

                )}

              </article>

            ))}

          </div>

        )}

      </section>

    </div>
  );
}
