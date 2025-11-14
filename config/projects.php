<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Base domain for provisioned projects
    |--------------------------------------------------------------------------
    |
    | All generated project domains will follow the pattern:
    |   {environment}.{base_domain}
    |
    */
    'base_domain' => env('PROJECT_BASE_DOMAIN', env('BASE_DOMAIN', 'chatplus.vn')),

    /*
    |--------------------------------------------------------------------------
    | Provisioning / destruction scripts
    |--------------------------------------------------------------------------
    |
    | Absolute paths to the helper scripts that create or destroy individual
    | project environments on the host machine.
    |
    */
    'provision_script' => env('PROJECT_PROVISION_SCRIPT', '/var/www/provision-n8n.sh'),
    'destroy_script' => env('PROJECT_DESTROY_SCRIPT', '/var/www/destroy-n8n.sh'),
];

