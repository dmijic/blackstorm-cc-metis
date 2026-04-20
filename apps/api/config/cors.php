<?php

$defaultOrigin = rtrim((string) env('APP_FRONTEND_URL', env('APP_URL', 'http://localhost:5173')), '/');
$allowedOrigins = array_values(array_filter(array_map(
    static fn (string $origin) => trim($origin),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', $defaultOrigin))
)));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => $allowedOrigins,
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
