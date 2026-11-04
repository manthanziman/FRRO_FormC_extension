import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
  gql
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { CombinedGraphQLErrors, ServerError } from "@apollo/client/errors";
import { API_ORIGIN } from "../config.js";

export const GRAPHQL_ENDPOINT = `${API_ORIGIN}/graphql`;
const forbiddenListeners = new Set();

export function onForbidden(listener) {
  forbiddenListeners.add(listener);
  return () => forbiddenListeners.delete(listener);
}

export function isAuthenticationError(error) {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors.some(
      (graphqlError) => graphqlError.extensions?.code === "UNAUTHENTICATED",
    );
  }
  return ServerError.is(error) && error.statusCode === 401;
}

export function isForbiddenError(error) {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors.some(
      (graphqlError) => graphqlError.extensions?.code === "FORBIDDEN",
    );
  }
  return ServerError.is(error) && error.statusCode === 403;
}

// ---- Links ---------------------------------------------------------------
const errorLink = onError(({ error }) => {
  if (isAuthenticationError(error)) {
    void chrome.storage.session.set({ isAuthenticated: false }).catch(() => {
      console.error("Could not update authentication state after a 401 response.");
    });
  } else if (isForbiddenError(error)) {
    forbiddenListeners.forEach((listener) => listener());
  }
});

const httpLink = new HttpLink({
  uri: GRAPHQL_ENDPOINT,
  credentials: "include",
  headers: { "X-GO-Client": "go-frro-extension" },
});

export const client = new ApolloClient({
  link: from([errorLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    query: { fetchPolicy: "network-only" },
    watchQuery: { fetchPolicy: "network-only" },
  }
});

// Kept so existing code that calls createGraphqlClient() still works.
// It returns the one shared client instead of creating a new one each time.
export function createGraphqlClient() {
  return client;
}

// ---- Operations ----------------------------------------------------------------
export const ME_QUERY = gql`
  query Me {
    me { id name roles }
  }
`;

export const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`;

export const BOOKING_QUERY = gql`
  query BookingByReservationId($reservationId: String!) {
    bookingByReservationId(reservationId: $reservationId) {
      id reservationId purpose checkInDate checkOutDate bookingTime
      customers {
        id firstName lastName email mobile dob age gender nationality address city photo
        passportNumber passportIssueDate passportExpiryDate
        passportIssuingCountry passportIssuingCity
        visaNumber visaType visaIssueDate visaExpiryDate
        visaIssuingCountry visaIssuingCity
      }
    }
  }
`;