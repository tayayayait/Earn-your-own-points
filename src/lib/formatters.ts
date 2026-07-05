type PointDirection = "earn" | "use" | "default";
type DateVariant = "admin" | "user" | "short" | "period";

const DEFAULT_POINT_LABEL = "P";
const SEOUL_TIME_ZONE = "Asia/Seoul";

export function formatPoint(
  value: number | null | undefined,
  type: PointDirection = "default",
  pointLabel = DEFAULT_POINT_LABEL,
): string {
  if (value == null || !Number.isFinite(value)) return "-";

  const absoluteValue = Math.abs(value);
  const formattedValue = new Intl.NumberFormat("ko-KR").format(absoluteValue);
  const sign = type === "earn" ? "+" : type === "use" ? "-" : "";

  return `${sign}${formattedValue}${pointLabel}`;
}

export function formatDate(date: Date | string, variant: DateVariant): string {
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsedDate.getTime())) return "-";

  const parts = getSeoulDateParts(parsedDate);

  switch (variant) {
    case "admin":
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    case "user":
      return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
    case "short":
      return `${parts.month}.${parts.day}`;
    case "period":
      return `${parts.year}.${parts.month}.${parts.day}`;
  }
}

export function formatPhone(phone: string, masked = false): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11) {
    const middle = masked ? "****" : digits.slice(3, 7);
    return `${digits.slice(0, 3)}-${middle}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    const middle = masked ? "***" : digits.slice(3, 6);
    return `${digits.slice(0, 3)}-${middle}-${digits.slice(6)}`;
  }

  return phone;
}

export function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;

  if (localPart.length <= 2) {
    return `${"*".repeat(localPart.length)}@${domain}`;
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function getSeoulDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}
