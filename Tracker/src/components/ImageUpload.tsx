import { useRef } from "react";
import { Upload, X, Receipt } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface ImageUploadProps {
  label?: string;
  file: File | null;
  previewUrl: string | null;
  onChange: (file: File | null, previewUrl: string | null) => void;
}

export const ImageUpload = ({
  label = "Receipt / Proof",
  file,
  previewUrl,
  onChange,
}: ImageUploadProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (selectedFile: File | null) => {
    if (!selectedFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type)) {
      toast({
        title: "Invalid file",
        description: "Please upload a JPEG, PNG, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    onChange(selectedFile, url);
  };

  const removeProof = () => {
    if (previewUrl && !previewUrl.startsWith("http")) {
      URL.revokeObjectURL(previewUrl);
    }
    onChange(null, null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-semibold text-foreground">{label}</label>}
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-border">
          <img
            src={previewUrl}
            alt="Receipt preview"
            className="h-48 w-full object-cover"
          />
          <button
            type="button"
            onClick={removeProof}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-card/90 text-foreground shadow-soft"
            aria-label="Remove receipt"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-elevated/50"
        >
          <Receipt className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-bold text-foreground">Upload receipt</p>
            <p className="text-xs text-muted-foreground">JPEG, PNG or WebP — max 5 MB</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1.5 text-xs font-bold text-muted-foreground">
            <Upload className="size-3" />
            Choose file
          </span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
};
