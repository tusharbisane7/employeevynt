
import React, {
  useCallback,
  useEffect,
  useState
} from 'react';

import { api } from '../api';

import {
  CheckCircle2,
  Clock3,
  AlertCircle,
  RefreshCw,
  Upload,
  CreditCard
} from 'lucide-react';

const money = value =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(Number(value || 0));

export default function EmployeePayment() {
  const [settings, setSettings] = useState(null);
  const [payment, setPayment] = useState(null);

  const [file, setFile] = useState(null);
  const [transactionReference, setTransactionReference] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  /*
  |--------------------------------------------------------------------------
  | LOAD PAYMENT DETAILS
  |--------------------------------------------------------------------------
  */

  const refresh = useCallback(async () => {
    try {
      const [settingsResponse, paymentResponse] =
        await Promise.all([
          api('/payments/settings'),
          api('/payments/me')
        ]);

      setSettings(settingsResponse.settings);
      setPayment(paymentResponse.payment);

      setError('');

    } catch (error) {
      setError(error.message || 'Unable to load payment details.');

    } finally {
      setLoading(false);
    }
  }, []);

  /*
  |--------------------------------------------------------------------------
  | AUTO REFRESH
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    refresh();

    const timer = window.setInterval(() => {
      refresh();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [refresh]);

  /*
  |--------------------------------------------------------------------------
  | SELECT PAYMENT SCREENSHOT
  |--------------------------------------------------------------------------
  */

  function chooseFile(nextFile) {
    setError('');
    setNotice('');

    if (!nextFile) {
      setFile(null);
      return;
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(nextFile.type)) {
      setFile(null);

      setError(
        'Choose a JPG, PNG or WEBP screenshot.'
      );

      return;
    }

    if (nextFile.size > 200 * 1024) {
      setFile(null);

      setError(
        'Payment screenshot must not exceed 200 KB.'
      );

      return;
    }

    setFile(nextFile);
  }

  /*
  |--------------------------------------------------------------------------
  | SUBMIT PAYMENT SCREENSHOT
  |--------------------------------------------------------------------------
  */

  async function submit(event) {
    event.preventDefault();

    setError('');
    setNotice('');

    if (!file) {
      setError('Please select your payment screenshot.');
      return;
    }

    const body = new FormData();

    body.append('screenshot', file);

    body.append(
      'transactionReference',
      transactionReference
    );

    setSubmitting(true);

    try {
      const result = await api(
        '/payments/submit',
        {
          method: 'POST',
          body
        }
      );

      setPayment(result.payment);

      setFile(null);
      setTransactionReference('');

      setNotice(result.message);

    } catch (error) {
      setError(
        error.message || 'Unable to submit payment.'
      );

    } finally {
      setSubmitting(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOADING STATE
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <div className="payment-card">
        Loading payment details…
      </div>
    );
  }

  const status = payment?.status;

  const paidOrPending =
    status === 'pending' ||
    status === 'approved';

  /*
  |--------------------------------------------------------------------------
  | PAYMENT PAGE
  |--------------------------------------------------------------------------
  */

  return (
    <div className="payment-layout">

      <section className="content-card payment-card">

        {/* HEADER */}

        <div className="payment-heading">

          <div>
            <span className="eyebrow">
              EMPLOYEE ACCOUNT
            </span>

            <h2>Employee Portal Fee</h2>

            <p className="muted">
              Review the fee details and complete your
              portal payment.
            </p>
          </div>

          <div className="payment-icon">
            <CreditCard size={25} />
          </div>

        </div>

        {/* ALERTS */}

        {error && (
          <div className="notice error">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {notice && (
          <div className="notice success">
            <CheckCircle2 size={16} />
            {notice}
          </div>
        )}

        {/* PAYMENT SETTINGS */}

        {settings && (
          <>

            {/* TOTAL AMOUNT */}

            <div className="payment-total">

              <span>Total payable</span>

              <strong>
                {money(settings.total_amount)}
              </strong>

            </div>

            {/* FEE BREAKDOWN */}

            <div className="payment-breakdown">

              <h3>Amount breakdown</h3>

              {(settings.fee_items || []).map(
                (item, index) => (
                  <div
                    className="payment-line"
                    key={`${item.label}-${index}`}
                  >
                    <span>{item.label}</span>

                    <b>
                      {money(item.amount)}
                    </b>
                  </div>
                )
              )}

              <div className="payment-line payment-grand">

                <span>Total</span>

                <b>
                  {money(settings.total_amount)}
                </b>

              </div>

            </div>

            {/* QR CODE */}

            <div className="payment-qr-section">

              <h3>Scan and pay using UPI</h3>

              {settings.qr_url ? (
                <img
                  className="payment-qr"
                  src={settings.qr_url}
                  alt="UPI payment QR code"
                />
              ) : (
                <div className="payment-qr-empty">
                  Payment QR code has not been configured.
                  Please contact the administrator.
                </div>
              )}

              {settings.upi_id && (
                <p className="upi-id">
                  UPI ID: <strong>{settings.upi_id}</strong>
                </p>
              )}

              <p className="muted small">
                Pay the exact amount shown above.
                Your payment will be verified by the
                administrator.
              </p>

            </div>

          </>
        )}

        {/* PENDING / APPROVED STATUS */}

        {paidOrPending ? (

          <div
            className={`payment-status-panel ${status}`}
          >

            {status === 'pending' ? (
              <Clock3 size={24} />
            ) : (
              <CheckCircle2 size={24} />
            )}

            <div>

              <strong>
                {status === 'pending'
                  ? 'Payment submitted – Pending verification'
                  : 'Payment approved'}
              </strong>

              <p>
                {status === 'pending'
                  ? 'Your payment screenshot has been submitted. The upload form is now closed while the administrator verifies your payment.'
                  : 'Your payment has been verified and approved by the administrator.'}
              </p>

              {payment.submitted_at && (
                <small>
                  Submitted:{' '}
                  {new Date(
                    payment.submitted_at
                  ).toLocaleString('en-IN')}
                </small>
              )}

              {payment.reviewed_at && (
                <small>
                  <br />
                  Reviewed:{' '}
                  {new Date(
                    payment.reviewed_at
                  ).toLocaleString('en-IN')}
                </small>
              )}

              {payment.admin_note && (
                <p className="muted small">
                  Admin note: {payment.admin_note}
                </p>
              )}

            </div>

          </div>

        ) : (

          <>

            {/* REJECTED STATUS */}

            {status === 'rejected' && (
              <div className="payment-status-panel rejected">

                <AlertCircle size={24} />

                <div>
                  <strong>Payment rejected</strong>

                  <p>
                    {payment.admin_note ||
                      'Please review the details and submit a new payment screenshot.'}
                  </p>

                </div>

              </div>
            )}

            {/* PAYMENT FORM */}

            <form
              className="payment-submit-form"
              onSubmit={submit}
            >

              <h3>Submit payment proof</h3>

              <label className="field">

                <span>
                  Transaction reference / UTR (optional)
                </span>

                <input
                  value={transactionReference}
                  onChange={event =>
                    setTransactionReference(
                      event.target.value
                    )
                  }
                  maxLength={120}
                  placeholder="Enter UPI transaction reference"
                />

              </label>

              <label className="field">

                <span>
                  Payment screenshot (maximum 200 KB)
                </span>

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={event =>
                    chooseFile(
                      event.target.files?.[0] || null
                    )
                  }
                  required
                />

              </label>

              {file && (
                <div className="payment-file">

                  <Upload size={16} />

                  <span>{file.name}</span>

                  <small>
                    {(file.size / 1024).toFixed(1)} KB
                  </small>

                </div>
              )}

              <button
                className="primary"
                disabled={
                  submitting ||
                  !settings?.qr_url ||
                  !settings?.upi_id
                }
              >
                {submitting
                  ? 'Submitting…'
                  : 'Submit payment screenshot'}
              </button>

            </form>

          </>

        )}

        {/* REFRESH */}

        <button
          className="secondary payment-refresh"
          onClick={refresh}
          type="button"
        >
          <RefreshCw size={15} />
          Refresh payment status
        </button>

      </section>

    </div>
  );
}
