import React from "react";
import { Download } from "lucide-react";

type PrintButtonProps = {
  label?: string;
  onPrint?: () => void;
  downloadUrl?: string;
  className?: string;
};

export const PrintButton = ({
  label = "Print",
  onPrint,
  downloadUrl,
  className,
}: PrintButtonProps) => {
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePrint}
        className={`rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/5 transition-colors ${className || ""}`}
        title="Print"
      >
        {label}
      </button>
      {downloadUrl && (
        <button
          onClick={handleDownload}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
          title="Download"
        >
          <Download className="mr-1 h-4 w-4" />
          Download
        </button>
      )}
    </div>
  );
};