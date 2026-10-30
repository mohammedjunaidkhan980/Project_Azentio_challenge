# Phase 2 API Documentation

## Scope

Phase 2 implements the product catalogue and public demo-enquiry workflows. All paths are relative to the API prefix `/api/v1`.

## Common response format

Success:
```json
{"success": true, "message": "Human-readable message", "data": {}, "meta": {}}
```

Error:
```json
{"success": false, "message": "Human-readable message", "error": {"code": "ERROR_CODE", "details": []}, "meta": {}}
```

Protected routes use `Authorization: Bearer <access_token>`. A `401` response means authentication is missing or invalid; a `403` response means the authenticated user lacks an allowed role.

## Products

### GET /api/v1/products

- Purpose: list published products.
- Authentication: not required.
- Role: none.
- Headers: none required.
- Query: `page` integer minimum 1 (default 1), `page_size` integer 1-100 (default 20).
- Success: `200`

```json
{
  "success": true,
  "message": "Products retrieved",
  "data": [{
    "id": "7c5dd1d1-2dc8-4bd6-a6c2-6c9eb1c5b6d2",
    "name": "AzentioCore",
    "slug": "azentio-core",
    "description": "Core platform",
    "category": "platform",
    "is_published": true,
    "created_at": "2026-10-30T12:00:00Z",
    "updated_at": "2026-10-30T12:00:00Z"
  }],
  "meta": {"page": 1, "page_size": 20, "total": 1, "total_pages": 1}
}
```

- Error responses: `422` for invalid query values, using `VALIDATION_ERROR`.

### GET /api/v1/products/{product_id}

- Purpose: retrieve one published product.
- Authentication: not required.
- Role: none.
- Success: `200`, using the `ProductOut` fields shown above.
- Error: `404 {"code":"PRODUCT_NOT_FOUND"}` for an unknown or unpublished product.
- Error: `422 {"code":"VALIDATION_ERROR"}` for an invalid UUID or other validation failure.

### POST /api/v1/products

- Purpose: create a product.
- Authentication: required.
- Role: `admin` or `employee`.
- Headers: `Authorization: Bearer <access_token>`, `Content-Type: application/json`.
- Body:

```json
{"name":"New Product","slug":"new-product","description":"Description","category":"platform","is_published":true}
```

`name` is 1-255 characters. `slug` is optional; if omitted it is generated from `name`. An explicit slug must match lowercase letters, digits, and hyphens. `description` and `category` are optional. `is_published` defaults to `false`.

- Success: `201` with the created product fields.
- Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `409 SLUG_CONFLICT`, or `422 VALIDATION_ERROR`.

### PATCH /api/v1/products/{product_id}

- Purpose: update product fields.
- Authentication: required.
- Role: `admin` or `employee`.
- Headers: bearer token and JSON content type.
- Body: any combination of:

```json
{"name":"Updated Name","description":"Updated description","category":"platform","is_published":true}
```

- Success: `200` with the updated product.
- Errors: `401`, `403`, `404 PRODUCT_NOT_FOUND`, or `422 VALIDATION_ERROR`.

### DELETE /api/v1/products/{product_id}

- Purpose: deactivate a product by setting `is_published=false`.
- Authentication: required.
- Role: `admin` or `employee`.
- Headers: bearer token.
- Body: none.
- Success: `200` with the product and `is_published:false`.
- Errors: `401`, `403`, `404 PRODUCT_NOT_FOUND`, or `422`.

## Demo enquiries

### POST /api/v1/demo-enquiries

- Purpose: submit a demo enquiry.
- Authentication: not required.
- Role: none.
- Headers: `Content-Type: application/json`.
- Body:

```json
{
  "name": "Jane Doe",
  "work_email": "jane.doe@company.com",
  "organisation_name": "Company Ltd",
  "product_id": "7c5dd1d1-2dc8-4bd6-a6c2-6c9eb1c5b6d2",
  "product_interest": "AzentioCore",
  "requirements": "We would like a full demo of the platform."
}
```

`product_id` is optional. `name` is 1-255 characters, `organisation_name` 1-255, `product_interest` 1-255, and `requirements` 10-5000 characters. Email is validated.

- Success: `201`

```json
{"success":true,"message":"Enquiry submitted successfully","data":{"id":"0d2f4e2b-9d1f-4b54-8f5a-6e9d8d0a4a11"},"meta":{}}
```

- Errors: `422 VALIDATION_ERROR`.
- Known limitation: the implementation does not verify that `product_id` exists and stores it without a foreign key in the Phase 2 migration.

### GET /api/v1/demo-enquiries

- Purpose: list all enquiries.
- Authentication: required.
- Role: `admin`, `employee`, or `moderator`.
- Query: `page` minimum 1 (default 1), `page_size` 1-100 (default 20).
- Success: `200` with full enquiry records and pagination metadata.
- Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, or `422 VALIDATION_ERROR`.

### GET /api/v1/demo-enquiries/{enquiry_id}

- Purpose: retrieve an enquiry.
- Authentication: required.
- Role: `admin`, `employee`, or `moderator`.
- Success: `200` with `id`, user-supplied contact and organisation fields, `product_id`, requirements, status, timestamps.
- Errors: `401`, `403`, `404 ENQUIRY_NOT_FOUND`, or `422`.

### PATCH /api/v1/demo-enquiries/{enquiry_id}/status

- Purpose: update enquiry status using the implemented transition rules.
- Authentication: required.
- Role: `admin`, `employee`, or `moderator`.
- Headers: bearer token and JSON content type.
- Body: `{"status":"in_review"}`
- Allowed values: `new`, `in_review`, `responded`, `closed`.
- Success: `200` with the full updated enquiry.
- Transition errors: `400 INVALID_STATUS_TRANSITION`.
- Other errors: `401`, `403`, `404 ENQUIRY_NOT_FOUND`, or `422 VALIDATION_ERROR`.

## Database and migrations

- Migration: `alembic/versions/72cef9ac2083_phase2_demo_enquiries.py`
- Models: `app/models/product.py`, `app/models/demo_enquiry.py`
- Repositories: `app/repositories/product_repository.py`, `app/repositories/demo_enquiry_repository.py`
- Services: `app/services/product_service.py`, `app/services/demo_enquiry_service.py`
- Routers: `app/api/v1/routers/products.py`, `app/api/v1/routers/demo_enquiries.py`
- Schemas: `app/schemas/products.py`, `app/schemas/demo_enquiries.py`

## Tests

- `tests/test_products.py`: public listing/detail, admin/employee mutations, unauthorized access, slug conflicts, unpublished visibility, persistence behavior at HTTP level.
- `tests/test_demo_enquiries.py`: public submission and validation, staff list/get/status, forbidden client access, status transitions.
- Baseline execution: 34 Phase 1/Phase 2 tests passed when this task began.
