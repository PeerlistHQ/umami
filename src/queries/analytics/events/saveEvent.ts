import {
  EVENT_NAME_LENGTH,
  URL_LENGTH,
  EVENT_TYPE,
  PAGE_TITLE_LENGTH,
  PAGE_OWNER_ID_LENGTH,
  PAGE_TYPE_LENGTH,
  PAGE_ID_LENGTH,
} from 'lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from 'lib/db';
import clickhouse from 'lib/clickhouse';
import kafka from 'lib/kafka';
import prisma from 'lib/prisma';
import { uuid } from 'lib/crypto';
import { saveEventData } from './saveEventData';

export async function saveEvent(args: {
  websiteId: string;
  sessionId: string;
  visitId: string;
  urlPath: string;
  urlQuery?: string;
  referrerPath?: string;
  referrerQuery?: string;
  referrerDomain?: string;
  pageTitle?: string;
  pageOwnerId?: string;
  pageType?: string;
  pageId?: string;
  eventName?: string;
  eventData?: any;
  hostname?: string;
  browser?: string;
  os?: string;
  device?: string;
  screen?: string;
  language?: string;
  country?: string;
  subdivision1?: string;
  subdivision2?: string;
  city?: string;
  tag?: string;
}) {
  return runQuery({
    [PRISMA]: () => relationalQuery(args),
    [CLICKHOUSE]: () => clickhouseQuery(args),
  });
}

async function relationalQuery(data: {
  websiteId: string;
  sessionId: string;
  visitId: string;
  urlPath: string;
  urlQuery?: string;
  referrerPath?: string;
  referrerQuery?: string;
  referrerDomain?: string;
  pageTitle?: string;
  pageOwnerId?: string;
  pageType?: string;
  pageId?: string;
  eventName?: string;
  eventData?: any;
  tag?: string;
}) {
  const {
    websiteId,
    sessionId,
    visitId,
    urlPath,
    urlQuery,
    referrerPath,
    referrerQuery,
    referrerDomain,
    eventName,
    eventData,
    pageTitle,
    pageOwnerId,
    pageType,
    pageId,
    tag,
  } = data;
  const websiteEventId = uuid();

  const websiteEvent = prisma.client.websiteEvent.create({
    data: {
      id: websiteEventId,
      websiteId,
      sessionId,
      visitId,
      urlPath: urlPath?.substring(0, URL_LENGTH),
      urlQuery: urlQuery?.substring(0, URL_LENGTH),
      referrerPath: referrerPath?.substring(0, URL_LENGTH),
      referrerQuery: referrerQuery?.substring(0, URL_LENGTH),
      referrerDomain: referrerDomain?.substring(0, URL_LENGTH),
      pageTitle: pageTitle?.substring(0, PAGE_TITLE_LENGTH),
      pageOwnerId: pageOwnerId?.substring(0, PAGE_OWNER_ID_LENGTH),
      pageType: pageType?.substring(0, PAGE_TYPE_LENGTH),
      pageId: pageId?.substring(0, PAGE_ID_LENGTH),
      eventType: eventName ? EVENT_TYPE.customEvent : EVENT_TYPE.pageView,
      eventName: eventName ? eventName?.substring(0, EVENT_NAME_LENGTH) : null,
      tag,
    },
  });

  if (eventData) {
    await saveEventData({
      websiteId,
      sessionId,
      eventId: websiteEventId,
      urlPath: urlPath?.substring(0, URL_LENGTH),
      eventName: eventName?.substring(0, EVENT_NAME_LENGTH),
      eventData,
    });
  }

  return websiteEvent;
}

async function clickhouseQuery(data: {
  websiteId: string;
  sessionId: string;
  visitId: string;
  urlPath: string;
  urlQuery?: string;
  referrerPath?: string;
  referrerQuery?: string;
  referrerDomain?: string;
  pageTitle?: string;
  pageOwnerId?: string;
  pageType?: string;
  pageId?: string;
  eventName?: string;
  eventData?: any;
  hostname?: string;
  browser?: string;
  os?: string;
  device?: string;
  screen?: string;
  language?: string;
  country?: string;
  subdivision1?: string;
  subdivision2?: string;
  city?: string;
  tag?: string;
}) {
  const {
    websiteId,
    sessionId,
    visitId,
    urlPath,
    urlQuery,
    referrerPath,
    referrerQuery,
    referrerDomain,
    pageTitle,
    pageOwnerId,
    pageType,
    pageId,
    eventName,
    eventData,
    country,
    subdivision1,
    subdivision2,
    city,
    tag,
    ...args
  } = data;
  const { insert, getUTCString } = clickhouse;
  const { sendMessage } = kafka;
  const eventId = uuid();
  const createdAt = getUTCString();

  const message = {
    ...args,
    website_id: websiteId,
    session_id: sessionId,
    visit_id: visitId,
    event_id: eventId,
    country: country,
    subdivision1:
      country && subdivision1
        ? subdivision1.includes('-')
          ? subdivision1
          : `${country}-${subdivision1}`
        : null,
    subdivision2: subdivision2,
    city: city,
    url_path: urlPath?.substring(0, URL_LENGTH),
    url_query: urlQuery?.substring(0, URL_LENGTH),
    referrer_path: referrerPath?.substring(0, URL_LENGTH),
    referrer_query: referrerQuery?.substring(0, URL_LENGTH),
    referrer_domain: referrerDomain?.substring(0, URL_LENGTH),
    page_title: pageTitle?.substring(0, PAGE_TITLE_LENGTH),
    page_owner_id: pageOwnerId?.substring(0, PAGE_OWNER_ID_LENGTH),
    page_type: pageType?.substring(0, PAGE_TYPE_LENGTH),
    page_id: pageId?.substring(0, PAGE_ID_LENGTH),
    event_type: eventName ? EVENT_TYPE.customEvent : EVENT_TYPE.pageView,
    event_name: eventName ? eventName?.substring(0, EVENT_NAME_LENGTH) : null,
    tag: tag,
    created_at: createdAt,
  };

  if (kafka.enabled) {
    await sendMessage('event', message);
  } else {
    await insert('website_event', [message]);
  }

  if (eventData) {
    await saveEventData({
      websiteId,
      sessionId,
      eventId,
      urlPath: urlPath?.substring(0, URL_LENGTH),
      eventName: eventName?.substring(0, EVENT_NAME_LENGTH),
      eventData,
      createdAt,
    });
  }

  return data;
}
