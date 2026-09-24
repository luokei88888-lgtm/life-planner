use chrono::{Datelike, Duration, Local, NaiveDate, Weekday};

pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

pub fn format_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

pub fn add_days(date: NaiveDate, days: i64) -> NaiveDate {
    date + Duration::days(days)
}

pub fn parse_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "日期格式无效".into())
}

pub fn parent_level(level: &str) -> Option<&'static str> {
    match level {
        "year" => Some("life"),
        "quarter" => Some("year"),
        "month" => Some("quarter"),
        "week" => Some("month"),
        _ => None,
    }
}

pub fn allowed_parent_levels(level: &str) -> &'static [&'static str] {
    match level {
        "year" => &["life"],
        "quarter" => &["year"],
        "month" => &["quarter", "year"],
        "week" => &["month", "quarter", "year"],
        _ => &[],
    }
}

pub fn is_allowed_parent(child: &str, parent: &str) -> bool {
    allowed_parent_levels(child).iter().any(|item| *item == parent)
}

pub fn last_day_of_month(year: i32, month: u32) -> NaiveDate {
    if month == 12 {
        NaiveDate::from_ymd_opt(year, 12, 31).expect("12-31")
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
            .expect("next month")
            .pred_opt()
            .expect("pred")
    }
}

pub fn week_start(date: NaiveDate, week_starts_on: i64) -> NaiveDate {
    let start = match week_starts_on {
        0 | 7 => Weekday::Sun,
        2 => Weekday::Tue,
        3 => Weekday::Wed,
        4 => Weekday::Thu,
        5 => Weekday::Fri,
        6 => Weekday::Sat,
        _ => Weekday::Mon,
    };
    let from_mon = date.weekday().num_days_from_monday() as i64;
    let start_from_mon = start.num_days_from_monday() as i64;
    let delta = (from_mon - start_from_mon + 7) % 7;
    date - Duration::days(delta)
}

pub fn containing(level: &str, date: NaiveDate, week_starts_on: i64) -> (NaiveDate, NaiveDate) {
    match level {
        "life" => (
            NaiveDate::from_ymd_opt(1970, 1, 1).expect("life start"),
            NaiveDate::from_ymd_opt(2099, 12, 31).expect("life end"),
        ),
        "year" => (
            NaiveDate::from_ymd_opt(date.year(), 1, 1).expect("jan1"),
            NaiveDate::from_ymd_opt(date.year(), 12, 31).expect("dec31"),
        ),
        "quarter" => {
            let start_month = (date.month() - 1) / 3 * 3 + 1;
            (
                NaiveDate::from_ymd_opt(date.year(), start_month, 1).expect("qstart"),
                last_day_of_month(date.year(), start_month + 2),
            )
        }
        "month" => (
            NaiveDate::from_ymd_opt(date.year(), date.month(), 1).expect("mstart"),
            last_day_of_month(date.year(), date.month()),
        ),
        _ => {
            let start = week_start(date, week_starts_on);
            (start, start + Duration::days(6))
        }
    }
}

pub fn period_for(
    level: &str,
    year: i32,
    today: NaiveDate,
    week_starts_on: i64,
    parent: Option<(NaiveDate, NaiveDate)>,
) -> (NaiveDate, NaiveDate) {
    let (mut start, mut end) = if level == "life" {
        containing("life", today, week_starts_on)
    } else if level == "year" {
        (
            NaiveDate::from_ymd_opt(year, 1, 1).expect("year start"),
            NaiveDate::from_ymd_opt(year, 12, 31).expect("year end"),
        )
    } else {
        containing(level, today, week_starts_on)
    };
    if let Some((parent_start, parent_end)) = parent {
        if start < parent_start {
            start = parent_start;
        }
        if end > parent_end {
            end = parent_end;
        }
        if start > end {
            let (first_start, first_end) = containing(level, parent_start, week_starts_on);
            start = first_start.max(parent_start);
            end = first_end.min(parent_end);
        }
    }
    (start, end)
}
