import { Wrench } from "lucide-react";

export default function Maintenance() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
            <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 space-y-8 text-center duration-700">
                {/* <img src="/brand/login-branding-image.png" alt="Spendova" className="mx-auto h-auto w-72 max-w-full" /> */}
                <div className="mx-auto mb-8 flex size-24 items-center justify-center rounded-full border border-primary/20 bg-primary/10 shadow-primary-action">
                    <Wrench className="size-12 animate-pulse text-primary" />
                </div>

                <div className="space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                        We'll be right back
                    </h1>
                    <p className="text-lg text-muted-foreground">
                        Spendova is currently undergoing scheduled maintenance to improve your experience. Thank you for your patience.
                    </p>
                </div>

                <div className="flex flex-col items-center gap-4 pt-8 text-sm text-muted-foreground">
                    <div className="h-1 w-12 rounded-full bg-border"></div>
                    <p>Spendova</p>
                </div>
            </div>
        </div>
    );
}
