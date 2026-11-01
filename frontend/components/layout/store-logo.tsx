import Image from "next/image";

export function StoreLogo({
  logoUrl,
  storeName,
  className = "h-8 w-8",
}: {
  logoUrl: string | null;
  storeName: string;
  className?: string;
}) {
  if (logoUrl)
    return (
      <Image
        src={logoUrl}
        alt=""
        width={64}
        height={64}
        unoptimized
        className={`shrink-0 rounded-lg object-contain ${className}`}
      />
    );
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-primary font-black text-white ${className}`}
    >
      {storeName.charAt(0).toUpperCase()}
    </span>
  );
}
