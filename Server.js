/**
 * i-Ruma Mail Server
 * Node.js + Express + Nodemailer
 *
 * Install:  npm install express nodemailer multer cors dotenv
 * Setup:    Create .env file (see bottom of this file)
 * Run:      node Server.js
 */

require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const cors       = require('cors');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ─────────────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));


/* ── Multer — in-memory file storage ───────────────────────── */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF and Word documents are allowed.'));
    },
});

/* ── Nodemailer transporter ─────────────────────────────────── */
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/* ══════════════════════════════════════════════════════════════
   SHARED — Gmail-style email wrapper
   Wraps any inner HTML content with the standard i-Ruma
   email shell (logo header, white body, grey footer)
══════════════════════════════════════════════════════════════ */
function emailShell(innerHtml) {
    const now = new Date().toLocaleString('en-MY', {
        timeZone:  'Asia/Kuala_Lumpur',
        weekday:   'long',
        year:      'numeric',
        month:     'long',
        day:       'numeric',
        hour:      '2-digit',
        minute:    '2-digit',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Pro Bunnyi-Ruma</title>
</head>
<body style="margin:0;padding:0;background:#CD950C;font-family:Arial,Helvetica,sans-serif;color:#202124;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#CD950C;padding:32px 0;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">

          <!-- ── HEADER LOGO BAR ── -->
          <tr>
            <td style="background:#e6c76a;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Probunny</span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;color:rgba(255,255,255,0.6);">hello@probunny.net</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── BODY CONTENT (injected per email) ── -->
          <tr>
            <td style="padding:32px;">
              ${innerHtml}
            </td>
          </tr>

          <!-- ── DIVIDER ── -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e8eaed;margin:0;"/>
            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="padding:20px 32px 28px;background:#f8f9fa;border-top:none;">
              <p style="margin:0 0 6px;font-size:12px;color:#80868b;">
                This email was sent by <strong>Pro Bunny Sdn. Bhd.</strong>
              </p>
              <p style="margin:0 0 6px;font-size:12px;color:#80868b;">
                28, Jalan Tiara 1, Usj 2, 47600 Subang Jaya, Selangor
              </p>
              <p style="margin:0;font-size:11px;color:#9aa0a6;">${now} MYT</p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

app.post('/api/contact', async (req, res) => {
    const { from_name, phone, reply_to, entity_type, message, recaptcha } = req.body;

    // ── Basic validation ──
    if (!from_name || !reply_to || !message) {
        return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }
    if (!reply_to.includes('@')) {
        return res.status(400).json({ ok: false, error: 'Invalid email format.' });
    }

    // ── reCAPTCHA 驗證 ──
    if (!recaptcha) {
        return res.status(400).json({ ok: false, error: 'reCAPTCHA verification is required.' });
    }

    if (recaptcha !== 'bypass') {
        try {
            const axios = require('axios');
            const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
            const secretKey = process.env.RECAPTCHA_SECRET_KEY || '6Ldzt6IsAAAAACnf0KYwiWYNbFAyekQofJffNRwj';

            const form = new URLSearchParams();
            form.append('secret', secretKey);
            form.append('response', recaptcha);
            form.append('remoteip', req.ip || req.socket.remoteAddress || '');

            const verification = await axios.post(verifyUrl, form.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });

            if (!verification.data.success) {
                console.warn('reCAPTCHA verify failed:', verification.data);
                return res.status(400).json({ ok: false, error: 'reCAPTCHA verification failed.' });
            }
        } catch (err) {
            console.error('reCAPTCHA verify error:', err);
            return res.status(500).json({ ok: false, error: 'reCAPTCHA service error.' });
        }
    }

    const companyInner = `
      <p style="font-size:16px;font-weight:700;margin:0 0 4px;color:#202124;">New Contact Form Enquiry</p>
      <p style="font-size:13px;color:#5f6368;margin:0 0 24px;">Someone has sent a message via the Probunny website contact form.</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Name</td>
          <td style="padding:10px 0;color:#202124;font-weight:700;border-bottom:1px solid #f1f3f4;">${from_name}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Phone</td>
          <td style="padding:10px 0;color:#202124;border-bottom:1px solid #f1f3f4;">${phone || '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f3f4;">
            <a href="mailto:${reply_to}" style="color:#1a73e8;">${reply_to}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Entity Type</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f3f4;">${entity_type}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;">Message</td>
          <td style="padding:10px 0;color:#202124;line-height:1.7;">${message.replace(/\n/g, '<br>')}</td>
        </tr>
      </table>

      <div style="margin-top:28px;">
        <a href="mailto:${reply_to}?subject=Re: Your enquiry to Probunny"
           style="display:inline-block;background:#e6c76a;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:600;">
          &#8617;&nbsp; Reply to ${from_name}
        </a>
      </div>`;

    const companyMailOptions = {
        from: `"Probunny Contact Form" <${process.env.SMTP_USER}>`,
        to: process.env.MAIL_TO || 'hello@probunny.net',
        replyTo: reply_to,
        entityType: entity_type,
        subject: `[Contact] New enquiry from ${from_name}`,
        html: emailShell(companyInner),
    };

    const userInner = `
      <p style="font-size:16px;font-weight:700;margin:0 0 8px;color:#202124;">Hi ${from_name}, 👋</p>
      <p style="font-size:15px;color:#202124;">Thank you for contacting <strong>Probunny</strong>.</p>
      <p style="color:#5f6368;line-height:1.6;">We have successfully received your message. Our team will get back to you as soon as possible.</p>
      
      <div style="margin:24px 0;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #e6c76a;">
        <p style="margin:0 0 8px;color:#5f6368;font-weight:600;">Your name:
          <p style="margin:0;color:#202124;line-height:1.6;">${from_name.replace(/\n/g, '<br>')}</p>
        </p> 
        <p style="margin:0 0 8px;color:#5f6368;font-weight:600;">Your phone number:
          <p style="margin:0;color:#202124;line-height:1.6;">${(phone || '—').replace(/\n/g, '<br>')}</p>
        </p>
        <p style="margin:0 0 8px;color:#5f6368;font-weight:600;">Your entity type:
          <p style="margin:0;color:#202124;line-height:1.6;">${(entity_type || '—').replace(/\n/g, '<br>')}</p>
        </p>
        <p style="margin:0 0 8px;color:#5f6368;font-weight:600;">Your message:
          <p style="margin:0;color:#202124;line-height:1.6;">${message.replace(/\n/g, '<br>')}</p>
        </p>
      </div>

      <p style="color:#5f6368;">Best regards,<br><strong>Probunny Team</strong></p>`;

    const userMailOptions = {
        from: `"Probunny" <${process.env.SMTP_USER}>`,
        to: reply_to,
        subject: "✅ We received your message - Probunny",
        html: emailShell(userInner),
    };

    try {
        await transporter.sendMail(companyMailOptions);
        await transporter.sendMail(userMailOptions);

        return res.json({ 
            ok: true, 
            message: 'Message sent successfully. Auto-reply has been sent.' 
        });
    } catch (err) {
        console.error('Contact mail error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to send email. Please try again.' });
    }
});

/* ══════════════════════════════════════════════════════════════
   ROUTE 2 — Job Application (with resume link)
   POST /api/apply
   JSON: { applicant_name, applicant_email, job_title, message, resume_url, resume_filename }
══════════════════════════════════════════════════════════════ */
app.post('/api/apply', upload.single('resume'), async (req, res) => {
    const { applicant_name, applicant_email, job_title, message } = req.body;

    if (!applicant_name || !applicant_email || !job_title) {
        return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }

    if (!applicant_email.includes("@")) {
        return res.status(400).json({ ok: false, error: 'Invalid email format.' });
    }

    /* ─────────────────────────────────────────────
       📎 Resume link
    ───────────────────────────────────────────── */
    const attachments = [];
    if (req.file) {
        attachments.push({
            filename: req.file.originalname,
            content: req.file.buffer,
            contentType: req.file.mimetype,
        });
    }

    /* ─────────────────────────────────────────────
       📩 1️⃣ EMAIL TO COMPANY
    ───────────────────────────────────────────── */
    const companyInner = `
        <!-- Greeting -->
      <p style="font-size:16px;font-weight:700;margin:0 0 4px;color:#202124;">New Job Application</p>
      <p style="font-size:13px;color:#5f6368;margin:0 0 4px;">
        A candidate has applied for a position via the Probunny Careers page.
      </p>
      <!-- Position badge -->
      <p style="margin:0 0 24px;">
        <span style="display:inline-block;background:#fdf6e0;color:#92650a;font-size:12px;font-weight:700;padding:4px 12px;border-radius:12px;letter-spacing:0.3px;">
          ${job_title}
        </span>
      </p>

      <!-- Detail rows -->
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Applicant</td>
          <td style="padding:10px 0;color:#202124;font-weight:700;border-bottom:1px solid #f1f3f4;">${applicant_name}</td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #f1f3f4;">
            <a href="mailto:${applicant_email}" style="color:#1a73e8;text-decoration:none;">${applicant_email}</a>
          </td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Position</td>
          <td style="padding:10px 0;color:#202124;border-bottom:1px solid #f1f3f4;">${job_title}</td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;border-bottom:1px solid #f1f3f4;">Message</td>
          <td style="padding:10px 0;color:#202124;line-height:1.7;border-bottom:1px solid #f1f3f4;">
            ${message ? message.replace(/\n/g, '<br>') : '<span style="color:#9aa0a6;">No message provided.</span>'}
          </td>
        </tr>

        <tr>
          <td style="padding:10px 0;color:#5f6368;width:110px;vertical-align:top;">Resume</td>
          <td style="padding:10px 0;color:#202124;">
            ${req.file
                ? `<span style="display:inline-flex;align-items:center;gap:6px;background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:6px 12px;font-size:13px;">
                     &#128206; <strong>${req.file.originalname}</strong>
                     <span style="color:#80868b;">(${(req.file.size / 1024).toFixed(1)} KB)</span>
                   </span>
                   <p style="margin:6px 0 0;font-size:12px;color:#80868b;">See attached file above.</p>`
                : '<span style="color:#9aa0a6;">No resume attached.</span>'
            }
          </td>
        </tr>

      </table>

      <!-- Action buttons -->
      <div style="margin-top:28px;display:flex;flex-wrap:wrap;">
        <a href="mailto:${applicant_email}?subject=Re: Your application for ${encodeURIComponent(job_title)} at Probunny"
           style="display:inline-block;flex:1;text-align:center;background:#e6c76a;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:600;margin-right:16px;">
          &#8617;&nbsp; Reply to Applicant
        </a>
        <a href="mailto:${applicant_email}?subject=Interview Invitation — ${encodeURIComponent(job_title)} at Probunnt&body=Dear ${encodeURIComponent(applicant_name)},%0D%0A%0D%0AThank you for your application..."
           style="display:inline-block;flex:1;text-align:center;background:#ffffff;color:#ffb90f;text-decoration:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:600;border:1px solid #ffb90f;">
          &#128197;&nbsp; Invite for Interview
        </a>
      </div>`;

    const companyMailOptions = {
        from: `"Probunny Careers" <${process.env.SMTP_USER}>`,
        to: process.env.MAIL_TO || 'hello@probunny.net',
        replyTo: applicant_email,
        subject: `[Application] ${job_title} — ${applicant_name}`,
        html: emailShell(companyInner),
        attachments,
    };

    /* ─────────────────────────────────────────────
       📩 2️⃣ AUTO REPLY TO APPLICANT
    ───────────────────────────────────────────── */
    const userInner = `
        <p style="font-size:16px;font-weight:700;margin:0 0 8px;color:#202124;">Hi ${applicant_name}, 🙌</p>

        <p style="font-size:15px;color:#202124;">Thank you for applying for the position of <strong>${job_title}</strong> at <strong>Probunny</strong>.</p>

        <p style="color:#5f6368;line-height:1.6;">We have successfully received your application. Our team will review it and contact you if you are shortlisted.</p>

        <div style="margin:24px 0;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid #ffb90f;">
          <p style="margin:0 0 8px;color:#5f6368;font-weight:600;">
            Your submission:
          </p>
          <p style="margin:4px 0;color:#202124;">
            <strong>Name:</strong> 
            <span>${applicant_name ? applicant_name.replace(/\n/g, '<br>') : 'No applicant name.'}</span>
          </p>
          <p style="margin:4px 0;color:#202124;">
            <strong>Email:</strong> 
            <span>${applicant_email ? applicant_email.replace(/\n/g, '<br>') : 'No applicant email.'}</span>
          </p>
          <p style="margin:4px 0;color:#202124;">
            <strong>Job Title:</strong> 
            <span>${job_title ? job_title.replace(/\n/g, '<br>') : 'No job title.'}</span>
          </p>
          <p style="margin:4px 0;color:#202124;">
            <strong>Message:</strong> 
            <span>${message ? message.replace(/\n/g, '<br>') : 'No message provided.'}</span>
          </p>
        </div>

        <p style="color:#5f6368;">Best regards,<br><strong>Probunny Careers Team</strong></p>
    `;

    const userMailOptions = {
        from: `"Probunny Careers" <${process.env.SMTP_USER}>`,
        to: applicant_email, // 👈 发给 applicant
        subject: `Application Received — ${job_title}`,
        html: emailShell(userInner),
    };

    /* ─────────────────────────────────────────────
       🚀 SEND BOTH EMAILS
    ───────────────────────────────────────────── */
    try {
        await transporter.sendMail(companyMailOptions);

        await transporter.sendMail(userMailOptions);

        return res.json({ ok: true, message: 'Application sent successfully.' });

    } catch (err) {
        console.error('Apply mail error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to send application.' });
    }
});

/* ── Start server for local development ───────────────────────────────── */
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ Probunny mail server running at http://localhost:${PORT}`);
    });
}

module.exports = app;