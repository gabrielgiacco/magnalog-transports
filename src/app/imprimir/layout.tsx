export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white text-black min-h-screen">
      {children}
    </div>
  );
}
