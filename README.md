## Role Menu Permissions

Backend now supports persistent, role-based menu permissions backed by the `RolePermission` table.

### Flow

- User logs in through `POST /api/v1/user/login`
- Login response now includes `menuPermissions` for the user's role
- `auth()` verifies the JWT and loads effective role permissions
- `requireMenuPermission("menu_key")` protects menu-scoped APIs
- If a role has no DB row yet, the server falls back to seeded default permissions

### Endpoints

- `GET /api/v1/role-permissions`
- `GET /api/v1/role-permissions/:role`
- `PUT /api/v1/role-permissions/:role`

Only `superAdmin` and `admin` can manage role permissions.

### Login Response

```json
{
  "success": true,
  "data": {
    "accessToken": "token_here",
    "user": {
      "Id": 1,
      "Email": "admin@example.com",
      "role": "admin"
    },
    "menuPermissions": ["overview", "inventory", "product"]
  }
}
```

### Notes

- Valid menu keys are defined in `app/enums/menuPermissions.js`
- Default role mappings live in `app/config/roleMenuPermissions.js`
- Protected routes can stack `auth()`, `requireRoles(...)`, and `requireMenuPermission(...)`

### Automatic courier status sync

After the database is ready and the server starts listening, the backend checks
Steadfast and Pathao orders in `in_courier` or `on_hold` immediately and every
five minutes. Existing stuck orders are included. It uses the courier credentials
saved in site settings and the existing provider status mappings. Pathao orders
need a saved consignment ID or tracking code; Steadfast can also look up the invoice.
Provider failures are logged and retried on the next sweep. Large queues can take
longer than five minutes; sweeps do not overlap within a server process.

Deploy/restart the backend to enable the worker. The server must stay running;
this is polling, not an instant webhook or a browser push update.
Run the regression tests with `node --test tests/*.test.js`.
