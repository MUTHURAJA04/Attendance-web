import React, { useEffect } from "react";

export function Dialog({ open, onOpenChange, children }: { open: boolean, onOpenChange: (open: boolean) => void, children: React.ReactNode }) {
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }
        return () => { document.body.style.overflow = "auto"; };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)}></div>
            <div className="relative z-10 w-full">
                {children}
            </div>
        </div>
    );
}

export function DialogContent({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={`bg-white rounded-xl shadow-2xl mx-auto w-full p-6 animate-in zoom-in-95 duration-200 ${className}`}>
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
