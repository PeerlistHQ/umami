import * as yup from 'yup';
import { canViewWebsite } from 'lib/auth';
import { useAuth, useCors, useValidate } from 'lib/middleware';
import { getRequestFilters, getRequestDateRange } from 'lib/request';
import { NextApiRequestQueryBody, WebsitePageviews } from 'lib/types';
import { NextApiResponse } from 'next';
import { methodNotAllowed, ok, unauthorized } from 'next-basics';
import { getPageviewStats, getSessionStats } from 'queries';
import { TimezoneTest, UnitTypeTest } from 'lib/yup';
import { getCompareDate } from 'lib/date';

export interface WebsitePageviewRequestQuery {
  websiteId: string;
  startAt: number;
  endAt: number;
  unit?: string;
  timezone?: string;
  url?: string;
  urls?: string;
  referrer?: string;
  title?: string;
  host?: string;
  os?: string;
  browser?: string;
  device?: string;
  country?: string;
  region: string;
  city?: string;
  tag?: string;
  compare?: string;
  onlypageviews?: string;
}

const schema = {
  GET: yup.object().shape({
    websiteId: yup.string().uuid().required(),
    startAt: yup.number().required(),
    endAt: yup.number().required(),
    unit: UnitTypeTest,
    timezone: TimezoneTest,
    url: yup.string(),
    urls: yup.string(),
    referrer: yup.string(),
    title: yup.string(),
    host: yup.string(),
    os: yup.string(),
    browser: yup.string(),
    device: yup.string(),
    country: yup.string(),
    region: yup.string(),
    city: yup.string(),
    tag: yup.string(),
    compare: yup.string(),
    onlypageviews: yup.string(),
  }),
};

export default async (
  req: NextApiRequestQueryBody<WebsitePageviewRequestQuery>,
  res: NextApiResponse<WebsitePageviews>,
) => {
  await useCors(req, res);
  await useAuth(req, res);
  await useValidate(schema, req, res);

  const { websiteId, timezone, compare, onlypageviews } = req.query;

  if (req.method === 'GET') {
    if (!(await canViewWebsite(req.auth, websiteId))) {
      return unauthorized(res);
    }

    const { startDate, endDate, unit } = await getRequestDateRange(req);

    const filters = {
      ...getRequestFilters(req),
      startDate,
      endDate,
      timezone,
      unit,
    };
    let urlsArray = [];
    if (req.query.urls) {
      urlsArray = req.query.urls.split(',');
    }

    filters['urls'] = urlsArray.map((x: string) => x.trim()).filter(x => x);

    const [pageviews, sessions] = await Promise.all([
      getPageviewStats(websiteId, filters),
      onlypageviews ? null : getSessionStats(websiteId, filters),
    ]);

    if (compare) {
      const { startDate: compareStartDate, endDate: compareEndDate } = getCompareDate(
        compare,
        startDate,
        endDate,
      );

      const [comparePageviews, compareSessions] = await Promise.all([
        getPageviewStats(websiteId, {
          ...filters,
          startDate: compareStartDate,
          endDate: compareEndDate,
        }),
        getSessionStats(websiteId, {
          ...filters,
          startDate: compareStartDate,
          endDate: compareEndDate,
        }),
      ]);

      return ok(res, {
        pageviews,
        sessions,
        startDate,
        endDate,
        compare: {
          pageviews: comparePageviews,
          sessions: compareSessions,
          startDate: compareStartDate,
          endDate: compareEndDate,
        },
      });
    }

    return ok(res, { pageviews, sessions });
  }

  return methodNotAllowed(res);
};
