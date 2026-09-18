<?php

declare(strict_types=1);

namespace App\Core;

final class Router
{
    /** @var list<array{method:string, regex:string, names:list<string>, handler:callable}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->add('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable $handler): void
    {
        $this->add('PUT', $pattern, $handler);
    }

    public function patch(string $pattern, callable $handler): void
    {
        $this->add('PATCH', $pattern, $handler);
    }

    public function delete(string $pattern, callable $handler): void
    {
        $this->add('DELETE', $pattern, $handler);
    }

    private function add(string $method, string $pattern, callable $handler): void
    {
        $names = [];
        $regex = preg_replace_callback('/\{(\w+)\}/', static function (array $m) use (&$names): string {
            $names[] = $m[1];
            return '([^/]+)';
        }, $pattern);
        $this->routes[] = ['method' => $method, 'regex' => '#^' . $regex . '$#', 'names' => $names, 'handler' => $handler, 'pattern' => $pattern];
    }

    public function dispatch(Request $request): void
    {
        $allowed = [];
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }
            if ($route['method'] !== $request->method) {
                $allowed[] = $route['method'];
                continue;
            }
            array_shift($matches);
            $request->params = array_combine($route['names'], $matches) ?: [];
            $request->route = $route['pattern'];
            ($route['handler'])($request);
            return;
        }
        if ($allowed !== []) {
            header('Allow: ' . implode(', ', array_unique($allowed)));
            throw new HttpError(405, 'Method not allowed.');
        }
        throw HttpError::notFound('Endpoint not found.');
    }
}
