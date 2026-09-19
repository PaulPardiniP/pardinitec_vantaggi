# Deploy Guide

1. Upload files
2. Configure `.env.production`
3. Run migrations `php api/scripts/migrate.php`
4. Setup cron `* * * * * php /path/to/api/scripts/dispatch_outbox.php`
