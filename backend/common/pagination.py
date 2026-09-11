"""
Pagination is deliberately per-endpoint, not global.

The Angular client expects plain arrays from most list endpoints and a DRF page
object (`{count, next, previous, results}`) from exactly three:

    GET /psychologists/        page_size 12   (patient browsing list)
    GET /admin/users/          page_size 20
    GET /admin/audit-logs/     page_size 25

Changing these defaults silently breaks the page counter in
`shared/components/pagination.component.ts`, which derives the page count from
`count / pageSize`.
"""
from rest_framework.pagination import PageNumberPagination


class BasePagination(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 100


class PsychologistPagination(BasePagination):
    page_size = 12


class AdminPagination(BasePagination):
    page_size = 20


class AuditLogPagination(BasePagination):
    page_size = 25
