import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { domainSmtp } from "@/db/schema";
import { getEnv } from "@/lib/cloudflare";
import { requireUser } from "@/lib/auth/cookies";
import { canManageDomains } from "@/lib/auth/admin";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getDomainForUser } from "@/lib/domains/service";
import { verifySmtp } from "@/lib/email/smtp";
import { parseSmtpConfig } from "@/lib/email/smtp-utils";
import { sendSystemEmail } from "@/lib/email/system-mail";

type Params = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store" };

const schema = z.object({
	host: z.string().trim().min(1).max(253),
	port: z.number().int().min(1).max(65535),
	secure: z.enum(["tls", "starttls"]),
	username: z.string().trim().min(1).max(320),
	/** Blank keeps the saved password. */
	password: z.string().max(500).optional(),
});

async function readConfig(env: CloudflareEnv, domainId: string) {
	const [row] = await getDb(env).select({ config: domainSmtp.config }).from(domainSmtp).where(eq(domainSmtp.domainId, domainId)).limit(1);
	return parseSmtpConfig(row?.config);
}

/** Saved SMTP settings for a domain, without the password. */
export async function GET(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });
	const saved = await readConfig(env, domain.id);
	return NextResponse.json({ smtp: saved ? { host: saved.host, port: saved.port, secure: saved.secure, username: saved.username } : null }, { headers: noStore });
}

/** Verifies the server accepts the login, then saves it. */
export async function PUT(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	if (!hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });
	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Enter a host, port, security mode and username." }, { status: 400 });
	const password = parsed.data.password || (await readConfig(env, domain.id))?.password;
	if (!password) return NextResponse.json({ error: "Enter the SMTP password." }, { status: 400 });
	const config = { ...parsed.data, password };
	try {
		await verifySmtp(env, config);
	} catch (error) {
		return NextResponse.json({ error: `Could not log in to ${config.host}:${config.port}: ${error instanceof Error ? error.message : "connection failed"}` }, { status: 400 });
	}
	const json = JSON.stringify(config);
	await getDb(env).insert(domainSmtp).values({ domainId: domain.id, config: json })
		.onConflictDoUpdate({ target: domainSmtp.domainId, set: { config: json, updatedAt: new Date() } });
	return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function POST(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	if (!hasValidSessionMutationOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	const domain = await getDomainForUser(env, user.id, id);
	if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });
	if (domain.sendingProvider !== "smtp") return NextResponse.json({ error: "SMTP is not selected for this domain" }, { status: 400 });
	const body = (await request.json().catch(() => ({}))) as { action?: string };
	if (body.action !== "test") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
	try {
		const sent = await sendSystemEmail(env, { to: user.email, subject: "Mailflare test email", text: `This message confirms ${domain.hostname} can send mail through SMTP.`, hostname: domain.hostname });
		if (!sent) return NextResponse.json({ error: `Create a mailbox on ${domain.hostname} to send the test from.` }, { status: 400 });
		return NextResponse.json({ ok: true, to: user.email });
	} catch (error) {
		return NextResponse.json({ error: error instanceof Error ? error.message : "SMTP send failed" }, { status: 502 });
	}
}
