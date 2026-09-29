import React, { useEffect } from "react";

export function Dialog({ open, onOpenChange, children }: { open: boolean, onOpenChange: (open: boolean) => void, children: React.ReactNode }) {
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
            document.body.classList.add("modal-open");
        } else {
            document.body.style.overflow = "auto";
            document.body.classList.remove("modal-open");
        }
        return () => {
            document.body.style.overflow = "auto";
            document.body.classList.remove("modal-open");
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:static print:block print:p-0 print:m-0 print:inset-auto">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm print:hidden" onClick={() => onOpenChange(false)}></div>
            <div className="relative z-10 w-full print:static print:w-full print:p-0 print:m-0">
                {children}
            </div>
        </div>
    );
}

export function DialogContent({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={`bg-white rounded-xl shadow-2xl mx-auto w-full p-6 animate-in zoom-in-95 duration-200 print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:w-full ${className}`}>
            {children}
        </div>
    );
}

export function DialogHeader({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={`flex flex-col space-y-1.5 text-center sm:text-left mb-4 ${className}`}>
            {children}
        </div>
    );
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="text-xl font-semibold leading-none tracking-tight">{children}</h2>
    );
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-sm text-muted-foreground">{children}</p>
    );
}
