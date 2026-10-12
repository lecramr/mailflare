import type { SmtpConfig } from "@/lib/email/smtp-types";
import type { OutboundProviderMessage } from "@/lib/email/outbound-provider-types";

export function parseSmtpConfig(json: string | null | undefined): SmtpConfig | null {
	try {
		const value = JSON.parse(json ?? "") as Partial<SmtpConfig>;
		if (!value.host || !value.username || !value.password || !Number.isInteger(value.port)) return null;
		return { host: value.host, port: value.port!, secure: value.secure === "tls" ? "tls" : "starttls", username: value.username, password: value.password };
	} catch {
		return null;
	}
}

export function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

/**
 * worker-mailer cannot mark an attachment inline, so inline images become data: URIs
 * in the HTML and drop out of the attachment list.
 * ponytail: some clients (Gmail) block data: images; switch to a MIME builder if that matters.
 */
export function inlineCidImages(message: OutboundProviderMessage): Pick<OutboundProviderMessage, "html" | "attachments"> {
	let html = message.html;
	const attachments = (message.attachments ?? []).filter((attachment) => {
		if (attachment.disposition !== "inline" || !attachment.contentId || !html) return true;
		const id = attachment.contentId.replace(/^<|>$/g, "");
		if (!html.includes(`cid:${id}`)) return true;
		html = html.split(`cid:${id}`).join(`data:${attachment.type};base64,${toBase64(attachment.content)}`);
		return false;
	});
	return { html, attachments };
}
