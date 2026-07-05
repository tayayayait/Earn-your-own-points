import { describe, expect, it } from "vitest";

import {
  TRANSACTION_PAGE_SIZE,
  buildTransactionListRpcArgs,
  canCancelTransaction,
  canRetryTransaction,
  createCancellationIdempotencyKey,
  formatTransactionCode,
  normalizeTransactionDetail,
  normalizeTransactionListResponse,
} from "./transaction-list-data";

describe("formatTransactionCode", () => {
  it("formats transaction dates and sequence numbers as PTX identifiers", () => {
    expect(formatTransactionCode("2026-07-03T01:23:45+09:00", 1)).toBe("PTX-20260703-000001");
    expect(formatTransactionCode("2026-12-31T23:59:59+09:00", 1203)).toBe("PTX-20261231-001203");
  });
});

describe("buildTransactionListRpcArgs", () => {
  it("normalizes Phase 1-4 filters into typed RPC args", () => {
    expect(
      buildTransactionListRpcArgs({
        transactionId: " PTX-20260703-000001 ",
        customerId: "customer-1",
        externalTransactionId: " ext-7788 ",
        type: "manual_earn",
        status: "confirmed",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-03",
        page: 3,
      }),
    ).toEqual({
      _transaction_id: "PTX-20260703-000001",
      _customer_id: "customer-1",
      _external_transaction_id: "ext-7788",
      _type: "manual_earn",
      _status: "confirmed",
      _date_from: "2026-07-01",
      _date_to: "2026-07-03",
      _page: 3,
      _page_size: TRANSACTION_PAGE_SIZE,
    });
  });

  it("falls back to safe defaults for invalid page values", () => {
    expect(buildTransactionListRpcArgs({ page: 0 })).toMatchObject({
      _transaction_id: null,
      _customer_id: null,
      _external_transaction_id: null,
      _type: null,
      _status: null,
      _date_from: null,
      _date_to: null,
      _page: 1,
      _page_size: TRANSACTION_PAGE_SIZE,
    });
  });
});

describe("normalizeTransactionListResponse", () => {
  it("normalizes RPC rows into table-safe transaction rows", () => {
    const result = normalizeTransactionListResponse({
      total_count: "24",
      page: 2,
      page_size: 20,
      transactions: [
        {
          sequence_number: 12,
          id: "tx-12",
          user_id: "user-1",
          customer_code: "CUS-000012",
          customer_name: "홍길동",
          customer_email: "hong@example.com",
          type: "manual_earn",
          status: "confirmed",
          amount: "5000",
          balance_after: "15000",
          memo: "관리자 보상 지급",
          external_transaction_id: "EXT-100",
          original_transaction_id: null,
          created_at: "2026-07-03T01:23:45+09:00",
          can_cancel: true,
          can_retry: false,
        },
      ],
    });

    expect(result.totalCount).toBe(24);
    expect(result.totalPages).toBe(2);
    expect(result.transactions[0]).toMatchObject({
      transactionCode: "PTX-20260703-000012",
      customerLabel: "홍길동 · CUS-000012",
      typeLabel: "관리자 지급",
      direction: "earn",
      amount: 5000,
      balanceAfter: 15000,
      canCancel: true,
      canRetry: false,
    });
  });
});

describe("normalizeTransactionDetail", () => {
  it("normalizes detail RPC payloads with customer, policy, and processing logs", () => {
    const detail = normalizeTransactionDetail({
      transaction: {
        sequence_number: 2,
        id: "tx-2",
        user_id: "user-2",
        type: "failed",
        status: "failed",
        amount: 1200,
        balance_after: null,
        memo: "외부 연동 실패",
        external_transaction_id: "EXT-2",
        original_transaction_id: null,
        created_at: "2026-07-03T02:00:00+09:00",
        can_cancel: false,
        can_retry: true,
      },
      customer: {
        id: "user-2",
        customer_code: "CUS-000002",
        full_name: "김철수",
        email: "kim@example.com",
        phone: "01012345678",
        status: "active",
        tier_name: "VIP",
      },
      policy: {
        policy_name: "기본 적립 정책",
        policy_snapshot: { earning_rate: 1 },
      },
      logs: [
        {
          id: "log-1",
          action: "transaction.retry.failed",
          reason: "timeout",
          created_at: "2026-07-03T02:01:00+09:00",
          actor_name: "관리자",
          actor_email: "admin@example.com",
        },
      ],
    });

    expect(detail?.transaction).toMatchObject({
      transactionCode: "PTX-20260703-000002",
      canRetry: true,
      externalTransactionId: "EXT-2",
    });
    expect(detail?.customer).toMatchObject({
      customerLabel: "김철수 · CUS-000002",
      tierName: "VIP",
    });
    expect(detail?.policy).toMatchObject({
      policyName: "기본 적립 정책",
    });
    expect(detail?.logs[0]).toMatchObject({
      action: "transaction.retry.failed",
      actorLabel: "관리자",
    });
  });
});

describe("transaction action guards", () => {
  it("allows cancellation only for confirmed transactions without existing reversals", () => {
    expect(canCancelTransaction("confirmed")).toBe(true);
    expect(canCancelTransaction("completed")).toBe(true);
    expect(canCancelTransaction("pending")).toBe(false);
    expect(canCancelTransaction("confirmed", true)).toBe(false);
  });

  it("allows retry only for failed transactions", () => {
    expect(canRetryTransaction("failed")).toBe(true);
    expect(canRetryTransaction("confirmed")).toBe(false);
  });

  it("creates stable cancellation idempotency keys", () => {
    expect(createCancellationIdempotencyKey("tx-1")).toBe("cancel:tx-1");
  });
});
