export type SmtpSecurity = "tls" | "starttls";

export type SmtpConfig = {
	host: string;
	port: number;
	/** `tls` is implicit TLS (usually 465); `starttls` upgrades a plain connection (usually 587). */
	secure: SmtpSecurity;
	username: string;
	password: string;
};

/** What the admin UI may see: everything but the password. */
export type SmtpConfigView = Omit<SmtpConfig, "password">;
