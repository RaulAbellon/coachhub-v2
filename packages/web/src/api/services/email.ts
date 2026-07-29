import { Resend } from "resend";

// Cliente perezoso: no instanciar en la carga del módulo para que la ausencia
// de RESEND_API_KEY no tumbe todo el servidor; solo falla al intentar enviar.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY no configurada");
    _resend = new Resend(key);
  }
  return _resend;
}

// Remitente. Sin dominio propio verificado, Resend permite enviar desde
// onboarding@resend.dev. Cuando el usuario verifique su dominio, basta cambiar
// esta constante (o EMAIL_FROM en .env) por p.ej. "CoachHub <no-reply@tudominio.com>".
const FROM = process.env.EMAIL_FROM || "CoachHub <onboarding@resend.dev>";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, text, html, replyTo }: SendEmailOptions) {
  const payload: any = {
    from: FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
  };
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (replyTo) payload.replyTo = replyTo;

  const { data, error } = await getResend().emails.send(payload);
  if (error) throw new Error(`Email failed: ${error.message}`);
  return data;
}

export function passwordResetEmailHtml(displayName: string, resetUrl: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0D1117;padding:32px;color:#E6EDF3">
    <div style="max-width:480px;margin:0 auto;background:#1C1C1E;border-radius:16px;padding:32px;border:1px solid #30363D">
      <div style="font-size:22px;font-weight:800;color:#FF6B35;letter-spacing:-0.02em;margin-bottom:8px">CoachHub</div>
      <h1 style="font-size:20px;font-weight:700;margin:16px 0 8px">Restablecer contraseña</h1>
      <p style="font-size:14px;line-height:1.6;color:#8B8B9B;margin:0 0 24px">
        Hola${displayName ? " " + displayName : ""}, hemos recibido una solicitud para restablecer tu contraseña de CoachHub.
        Pulsa el botón para elegir una nueva. Este enlace caduca en 1 hora.
      </p>
      <a href="${resetUrl}" style="display:inline-block;background:#FF6B35;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:12px">
        Restablecer contraseña
      </a>
      <p style="font-size:12px;line-height:1.6;color:#6E7681;margin:24px 0 0">
        Si no has solicitado esto, ignora este correo; tu contraseña seguirá siendo la misma.
      </p>
      <p style="font-size:12px;line-height:1.6;color:#6E7681;margin:12px 0 0;word-break:break-all">
        Si el botón no funciona, copia este enlace en tu navegador:<br/>${resetUrl}
      </p>
    </div>
  </div>`;
}

export function welcomeEmailHtml(displayName: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0D1117;padding:32px;color:#E6EDF3">
    <div style="max-width:480px;margin:0 auto;background:#1C1C1E;border-radius:16px;padding:32px;border:1px solid #30363D">
      <div style="font-size:22px;font-weight:800;color:#FF6B35;letter-spacing:-0.02em;margin-bottom:8px">CoachHub</div>
      <h1 style="font-size:20px;font-weight:700;margin:16px 0 8px">¡Bienvenido a CoachHub${displayName ? ", " + displayName : ""}!</h1>
      <p style="font-size:14px;line-height:1.6;color:#8B8B9B;margin:0 0 16px">
        Tu cuenta ya está creada y lista para usar. Desde CoachHub podrás gestionar tus equipos,
        planificar sesiones, llevar el control de asistencia y mucho más.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#8B8B9B;margin:0 0 24px">
        Para empezar, entra con tu usuario y crea o comparte tu primer equipo.
      </p>
      <p style="font-size:12px;line-height:1.6;color:#6E7681;margin:24px 0 0">
        Si no has creado esta cuenta, puedes ignorar este correo.
      </p>
    </div>
  </div>`;
}
