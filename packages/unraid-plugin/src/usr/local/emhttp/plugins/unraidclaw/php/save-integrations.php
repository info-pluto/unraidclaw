<?php
$plugin = 'unraidclaw';
$file = "/boot/config/plugins/{$plugin}/integrations.json";
header('Content-Type: application/json');

$raw = $_GET['data'] ?? $_POST['data'] ?? '';
if ($raw === '') {
    echo json_encode(['success' => false, 'error' => 'Missing data']);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
    exit;
}

$defaults = [
    'jdownloader' => [
        'enabled' => false,
        'mode' => 'direct',
        'baseUrl' => '',
        'deviceName' => '',
        'email' => '',
        'password' => '',
        'containerName' => '',
        'downloadRoot' => '/mnt/user/downloads',
        'defaultPackageNamePrefix' => 'OpenClaw',
        'pollIntervalMs' => 5000,
    ],
];

$merged = $defaults;
if (isset($data['jdownloader']) && is_array($data['jdownloader'])) {
    $jd = array_merge($defaults['jdownloader'], $data['jdownloader']);
    $jd['enabled'] = !empty($jd['enabled']);
    $jd['mode'] = ($jd['mode'] ?? 'direct') === 'myjd' ? 'myjd' : 'direct';
    $jd['pollIntervalMs'] = max(1000, (int)($jd['pollIntervalMs'] ?? 5000));
    $merged['jdownloader'] = $jd;
}

$dir = dirname($file);
if (!is_dir($dir)) {
    @mkdir($dir, 0755, true);
}

$ok = @file_put_contents($file, json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n") !== false;
if ($ok) @chmod($file, 0600);

echo json_encode(['success' => $ok, 'integrations' => $merged]);
