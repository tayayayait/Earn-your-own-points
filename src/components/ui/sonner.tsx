import * as React from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const [position, setPosition] = React.useState<ToasterProps["position"]>("top-right");

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const syncPosition = () => setPosition(mediaQuery.matches ? "bottom-center" : "top-right");

    syncPosition();
    mediaQuery.addEventListener("change", syncPosition);

    return () => mediaQuery.removeEventListener("change", syncPosition);
  }, []);

  return (
    <Sonner
      className="toaster group"
      position={position}
      offset={16}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
