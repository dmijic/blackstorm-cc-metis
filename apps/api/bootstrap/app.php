<?php

use App\Http\Middleware\SecureHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // statefulApi() intentionally omitted — this app uses Sanctum Bearer tokens only.
        // Enabling it would trigger CSRF checks on all POST requests from the frontend domain,
        // because the browser accumulates a session cookie but the React client does not manage XSRF-TOKEN.
        $middleware->append(SecureHeaders::class);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
