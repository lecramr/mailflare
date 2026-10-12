import { getEmailAddress } from "@/lib/email/address";
import { isNodeRuntime } from "@/lib/runtime";
import type { OutboundProviderMessage } from "@/lib/email/outbound-provider-types";
import type { SmtpConfig } from "@/lib/email/smtp-types";
import { inlineCidImages, toBase64 } from "@/lib/email/smtp-utils";

function messageIdFor(message: OutboundProviderMessage): string {
	if (message.headers?.["Message-ID"]) return message.headers["Message-ID"];
	const domain = getEmailAddress(message.from).split("@")[1] || "mailflare.local";
	return `<${crypto.randomUUID()}@${domain}>`;
}

/**
 * Sends through any SMTP server. Workers use worker-mailer (cloudflare:sockets, so
 * ports 465/587 only, never 25); the self-hosted Node server uses nodemailer.
 * Dynamic imports keep each runtime from bundling the other's library.
 */
export async function sendWithSmtp(env: CloudflareEnv, config: SmtpConfig, message: OutboundProviderMessage): Promise<{ messageId: string }> {
	const messageId = messageIdFor(message);
	const headers = { ...message.headers, "Message-ID": messageId };

	if (isNodeRuntime(env)) {
		const nodemailer = (await import("nodemailer")).default;
		const transport = nodemailer.createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure === "tls",
			requireTLS: config.secure === "starttls",
			auth: { user: config.username, pass: config.password },
		});
		await transport.sendMail({
			from: message.from,
			to: message.to,
			cc: message.cc,
			bcc: message.bcc,
			subject: message.subject,
			text: message.text,
			html: message.html,
			headers: Object.fromEntries(Object.entries(headers).filter(([key]) => key !== "Message-ID")),
			messageId,
			attachments: message.attachments?.map((attachment) => ({
				filename: attachment.filename,
				contentType: attachment.type,
				content: Buffer.from(attachment.content),
				contentDisposition: attachment.disposition,
				cid: attachment.disposition === "inline" ? attachment.contentId ?? undefined : undefined,
			})),
		});
		return { messageId };
	}

	const { WorkerMailer } = await import("worker-mailer");
	const { html, attachments } = inlineCidImages(message);
	await WorkerMailer.send(
		{
			host: config.host,
			port: config.port,
			secure: config.secure === "tls",
			startTls: config.secure === "starttls",
			credentials: { username: config.username, password: config.password },
			authType: ["plain", "login"],
		},
		{
			from: message.from,
			to: message.to,
			cc: message.cc,
			bcc: message.bcc,
			subject: message.subject,
			text: message.text,
			html,
			headers,
			attachments: attachments?.map((attachment) => ({ filename: attachment.filename, mimeType: attachment.type, content: toBase64(attachment.content) })),
		},
	);
	return { messageId };
}

/** Opens a connection and authenticates without sending anything. Node runtime only checks via nodemailer; Workers connect and close. */
export async function verifySmtp(env: CloudflareEnv, config: SmtpConfig): Promise<void> {
	if (isNodeRuntime(env)) {
		const nodemailer = (await import("nodemailer")).default;
		await nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure === "tls", requireTLS: config.secure === "starttls", auth: { user: config.username, pass: config.password } }).verify();
		return;
	}
	const { WorkerMailer } = await import("worker-mailer");
	const mailer = await WorkerMailer.connect({
		host: config.host,
		port: config.port,
		secure: config.secure === "tls",
		startTls: config.secure === "starttls",
		credentials: { username: config.username, password: config.password },
		authType: ["plain", "login"],
	});
	await mailer.close();
}
