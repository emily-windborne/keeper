export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-dvh bg-surface font-sans antialiased text-ink">
      {children}
    </div>
  );
}
