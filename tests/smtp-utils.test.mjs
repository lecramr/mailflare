import assert from "node:assert/strict";
import test from "node:test";
import { inlineCidImages, parseSmtpConfig } from "../src/lib/email/smtp-utils.ts";

test("parseSmtpConfig accepts a full config and defaults to STARTTLS", () => {
	const config = parseSmtpConfig(JSON.stringify({ host: "smtp.example.com", port: 587, username: "u", password: "p" }));
	assert.deepEqual(config, { host: "smtp.example.com", port: 587, secure: "starttls", username: "u", password: "p" });
});

test("parseSmtpConfig rejects missing or malformed config", () => {
	assert.equal(parseSmtpConfig(null), null);
	assert.equal(parseSmtpConfig("not json"), null);
	assert.equal(parseSmtpConfig(JSON.stringify({ host: "h", port: 587, username: "u" })), null);
});

test("inlineCidImages turns referenced cid images into data URIs and keeps real attachments", () => {
	const bytes = new TextEncoder().encode("img").buffer;
	const { html, attachments } = inlineCidImages({
		from: "a@b.c", to: ["d@e.f"], subject: "s",
		html: '<img src="cid:logo">',
		attachments: [
			{ filename: "logo.png", type: "image/png", content: bytes, disposition: "inline", contentId: "<logo>" },
			{ filename: "a.pdf", type: "application/pdf", content: bytes, disposition: "attachment" },
		],
	});
	assert.equal(html, '<img src="data:image/png;base64,aW1n">');
	assert.deepEqual(attachments.map((a) => a.filename), ["a.pdf"]);
});
