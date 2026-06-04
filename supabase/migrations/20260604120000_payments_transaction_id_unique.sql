-- IAP 중복 지급 방지: 동일 Apple transactionId로 payments가 두 번 쌓이지 않도록
create unique index if not exists payments_transaction_id_unique
  on public.payments (transaction_id)
  where transaction_id is not null;
