export type StatusTone = "success" | "warning" | "neutral" | "danger" | "info";
type StatusMeta = { label: string; tone: StatusTone };
type TransactionTypeMeta = { label: string; sign: "+" | "-" | "±" };
type StatusMapType = "customer" | "transaction" | "transactionType" | "policy";

export const customerStatusMap = {
  active: { label: "활성", tone: "success" },
  dormant: { label: "휴면", tone: "warning" },
  withdrawn: { label: "탈퇴", tone: "neutral" },
  blocked: { label: "차단", tone: "danger" },
} as const satisfies Record<string, StatusMeta>;

export const transactionTypeMap = {
  earn: { label: "구매 적립", sign: "+" },
  event_earn: { label: "이벤트 지급", sign: "+" },
  manual_earn: { label: "관리자 지급", sign: "+" },
  redeem: { label: "포인트 사용", sign: "-" },
  use: { label: "포인트 사용", sign: "-" },
  manual_deduct: { label: "관리자 차감", sign: "-" },
  cancel: { label: "취소", sign: "-" },
  earn_cancel: { label: "적립 취소", sign: "-" },
  use_cancel: { label: "사용 취소", sign: "+" },
  expire: { label: "유효기간 만료", sign: "-" },
  adjust: { label: "정정", sign: "±" },
} as const satisfies Record<string, TransactionTypeMeta>;

export const transactionStatusMap = {
  pending: { label: "예정", tone: "warning" },
  completed: { label: "확정", tone: "success" },
  confirmed: { label: "확정", tone: "success" },
  cancelled: { label: "취소", tone: "neutral" },
  canceled: { label: "취소", tone: "neutral" },
  failed: { label: "실패", tone: "danger" },
  expired: { label: "만료", tone: "neutral" },
} as const satisfies Record<string, StatusMeta>;

export const policyStatusMap = {
  draft: { label: "초안", tone: "neutral" },
  scheduled: { label: "예약", tone: "info" },
  active: { label: "활성", tone: "success" },
  paused: { label: "일시중지", tone: "warning" },
  ended: { label: "종료", tone: "neutral" },
  disabled: { label: "비활성", tone: "danger" },
} as const satisfies Record<string, StatusMeta>;

export function getStatusMeta(type: StatusMapType, status: string): StatusMeta {
  if (type === "transactionType") {
    const typeMeta = transactionTypeMap[status as keyof typeof transactionTypeMap];
    if (typeMeta) return { label: typeMeta.label, tone: transactionTypeTone(typeMeta.sign) };
  }

  const statusMap = {
    customer: customerStatusMap,
    transaction: transactionStatusMap,
    policy: policyStatusMap,
  }[type];

  const meta = statusMap?.[status as keyof typeof statusMap];
  return meta ?? { label: status, tone: "neutral" };
}

function transactionTypeTone(sign: TransactionTypeMeta["sign"]): StatusTone {
  if (sign === "+") return "success";
  if (sign === "-") return "danger";
  return "neutral";
}
