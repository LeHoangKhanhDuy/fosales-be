const url = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV !== 'test' || !/\/fosales_test(\?|$)/.test(url)) {
  console.error('Từ chối chạy e2e: cần NODE_ENV=test và DATABASE_URL trỏ tới fosales_test (xem test/e2e.env).');
  process.exit(1);
}
