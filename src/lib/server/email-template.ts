// Email HTML in the Night shift style. Built for the lowest common denominator:
// table layout, inline styles, bgcolor attributes (Outlook ignores CSS backgrounds),
// a padded-link button with an Outlook VML fallback, and no web fonts or SVG.

const C = {
	paper: '#101114',
	panel: '#1a1c21',
	line: '#2b2f36',
	ink: '#f2f3f5',
	ink2: '#9ba1ab',
	lime: '#c6f36a',
	onLime: '#101114'
};
const FONT = "'Space Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export function escapeHtml(s: string): string {
	return s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);
}

interface Layout {
	origin: string;
	/** Inbox preview line, hidden in the body. */
	preheader: string;
	title: string;
	/** Paragraphs above the button (plain text, escaped here). */
	intro: string[];
	button: { label: string; url: string };
	/** Small print under the button (plain text, escaped here). */
	outro: string[];
	/** Why they got this email (plain text, escaped here). */
	footer: string;
}

export function emailLayout({
	origin,
	preheader,
	title,
	intro,
	button,
	outro,
	footer
}: Layout): string {
	const url = escapeHtml(button.url);
	const p = (text: string, color: string, size: number) =>
		`<p style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:1.55;color:${color};">${escapeHtml(text)}</p>`;

	return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root { color-scheme: dark; supported-color-schemes: dark; }
body { margin:0 !important; padding:0 !important; width:100% !important; }
a { color:${C.lime}; }
@media (max-width:600px) {
  .card { padding:28px 22px !important; }
  .h1 { font-size:26px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.paper};" bgcolor="${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.paper};opacity:0;">${escapeHtml(preheader)}${'&#8199;&#65279;&#847; '.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background-color:${C.paper};">
<tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:10px;" valign="middle"><img src="${escapeHtml(origin)}/icon-192.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;"></td>
    <td valign="middle" style="font-family:${FONT};font-size:17px;font-weight:bold;color:${C.ink};">Workout Builder</td>
  </tr></table>
</td></tr>
<tr><td class="card" bgcolor="${C.panel}" style="background-color:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:36px 32px;">
  <h1 class="h1" style="margin:0 0 16px;font-family:${FONT};font-size:30px;line-height:1.15;font-weight:bold;color:${C.lime};">${escapeHtml(title)}</h1>
  ${intro.map((t) => p(t, C.ink, 16)).join('\n  ')}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin:8px 0 24px;"><tr><td align="center" bgcolor="${C.lime}" style="border-radius:999px;background-color:${C.lime};">
    <!--[if mso]><v:roundrect href="${url}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="50%" stroke="f" fillcolor="${C.lime}"><w:anchorlock/><center style="color:${C.onLime};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(button.label)}</center></v:roundrect><![endif]-->
    <!--[if !mso]><!--><a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:16px;font-weight:bold;line-height:20px;color:${C.onLime};text-decoration:none;border-radius:999px;">${escapeHtml(button.label)}</a><!--<![endif]-->
  </td></tr></table>
  ${outro.map((t) => p(t, C.ink2, 14)).join('\n  ')}
  <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.ink2};">Button not working? Paste this into your browser:<br><a href="${url}" style="color:${C.lime};word-break:break-all;">${url}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.ink2};">
  ${escapeHtml(footer)} &middot; <a href="${escapeHtml(origin)}" style="color:${C.ink2};">Workout Builder</a>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}
