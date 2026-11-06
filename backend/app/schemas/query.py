"""Query request/response schemas with a discriminated period union."""
import uuid
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator
import datetime as _dt


class DayPeriod(BaseModel):
    mode: Literal["DAY"]
    day: _dt.date


class MonthPeriod(BaseModel):
    mode: Literal["MONTH"]
    month: str  # "YYYY-MM"

    @field_validator("month")
    @classmethod
    def _check_month(cls, v: str) -> str:
        try:
            _dt.datetime.strptime(v, "%Y-%m")
        except ValueError:
            raise ValueError("month must be formatted YYYY-MM")
        return v


class YearPeriod(BaseModel):
    mode: Literal["YEAR"]
    year: str  # "YYYY"

    @field_validator("year")
    @classmethod
    def _check_year(cls, v: str) -> str:
        try:
            _dt.datetime.strptime(v, "%Y")
        except ValueError:
            raise ValueError("year must be formatted YYYY")
        return v


class RangePeriod(BaseModel):
    mode: Literal["RANGE"]
    start: _dt.date
    end: _dt.date

    @field_validator("end")
    @classmethod
    def _check_order(cls, v: _dt.date, info) -> _dt.date:
        start = info.data.get("start")
        if start is not None and v < start:
            raise ValueError("end must be on or after start")
        return v


Period = Annotated[
    Union[DayPeriod, MonthPeriod, YearPeriod, RangePeriod],
    Field(discriminator="mode"),
]


class QueryRequest(BaseModel):
    plant_id: uuid.UUID
    unit_id: uuid.UUID
    parameters: list[str] = Field(default_factory=list)  # [] = all parameters
    period: Period


class QueryRowOut(BaseModel):
    recorded_date: _dt.date
    parameter: str
    value: float
    uom: str | None


class QuerySummaryOut(BaseModel):
    parameter: str
    min: float
    max: float
    avg: float


class QueryResponse(BaseModel):
    rows: list[QueryRowOut]
    summary: list[QuerySummaryOut]
