"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SmtpConfigView, SmtpSecurity } from "@/lib/email/smtp-types";
import { requestJson } from "./api";

type Props = { domainId: string; selected: boolean; onSaved: () => void };

export default function SmtpSendingConfig({ domainId, selected, onSaved }: Props) {
	const { t } = useLanguage();
	const [host, setHost] = useState("");
	const [port, setPort] = useState("587");
	const [secure, setSecure] = useState<SmtpSecurity>("starttls");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState<"save" | "test" | null>(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	useEffect(() => {
		requestJson<{ smtp: SmtpConfigView | null }>(`/api/domains/${domainId}/smtp`, "GET")
			.then(({ smtp }) => {
				if (!smtp) return;
				setHost(smtp.host); setPort(String(smtp.port)); setSecure(smtp.secure); setUsername(smtp.username); setSaved(true);
			})
			.catch(() => {});
	}, [domainId]);

	async function run(kind: "save" | "test", action: () => Promise<void>) {
		setBusy(kind); setError(""); setNotice("");
		try { await action(); } catch (err) { setError(err instanceof Error ? err.message : t("domains.requestFailed")); } finally { setBusy(null); }
	}

	const save = (event: FormEvent) => {
		event.preventDefault();
		void run("save", async () => {
			await requestJson(`/api/domains/${domainId}/smtp`, "PUT", { host, port: Number(port), secure, username, password: password || undefined });
			setPassword(""); setSaved(true); setNotice(t("smtp.saved")); onSaved();
		});
	};
	const sendTest = () => run("test", async () => {
		const data = await requestJson<{ to: string }>(`/api/domains/${domainId}/smtp`, "POST", { action: "test" });
		setNotice(t("resend.testSent", { to: data.to }));
	});

	return (
		<form onSubmit={save} className="space-y-2">
			<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
				<label className="text-xs text-neutral-600">{t("smtp.host")}
					<Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" required className="mt-1 bg-white" />
				</label>
				<label className="text-xs text-neutral-600">{t("smtp.port")}
					<Input type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} required className="mt-1 bg-white" />
				</label>
			</div>
			<label className="block text-xs text-neutral-600">{t("smtp.security")}
				<select value={secure} onChange={(e) => setSecure(e.target.value as SmtpSecurity)} className="mt-1 h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm">
					<option value="starttls">{t("smtp.starttls")}</option>
					<option value="tls">{t("smtp.tls")}</option>
				</select>
			</label>
			<div className="grid gap-2 sm:grid-cols-2">
				<label className="text-xs text-neutral-600">{t("smtp.username")}
					<Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required className="mt-1 bg-white" />
				</label>
				<label className="text-xs text-neutral-600">{t("smtp.password")}
					<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required={!saved} placeholder={saved ? t("smtp.passwordSaved") : ""} className="mt-1 bg-white" />
				</label>
			</div>
			<p className="text-xs text-neutral-500">{t("smtp.hint")}</p>
			<div className="flex gap-2">
				<Button type="submit" size="sm" variant="outline" className="bg-white" disabled={busy !== null}>{busy === "save" ? t("smtp.saving") : t("smtp.save")}</Button>
				{saved && selected && (
					<Button type="button" size="sm" variant="outline" className="bg-white" disabled={busy !== null} onClick={() => void sendTest()}>{busy === "test" ? t("resend.sending") : t("resend.sendTest")}</Button>
				)}
			</div>
			{notice && <p role="status" className="text-xs text-green-700">{notice}</p>}
			{error && <p role="alert" className="text-xs text-red-600">{error}</p>}
		</form>
	);
}
