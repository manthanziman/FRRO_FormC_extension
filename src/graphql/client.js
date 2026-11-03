import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
  gql
} from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { CombinedGraphQLErrors, ServerError } from "@apollo/client/errors";

// Set in .env.development / .env.production (see below)
export const GRAPHQL_ENDPOINT = import.meta.env.EXTENSION_PUBLIC_API_URL;

if (!GRAPHQL_ENDPOINT) {
  throw new Error("EXTENSION_PUBLIC_API_URL is not set");
}

// ---- Auth-lost notifications -------------------------------------------
// The UI subscribes with onAuthLost(() => showLoginScreen())
const authLostListeners = new Set();

export function onAuthLost(listener) {
  authLostListeners.add(listener);
  return () => authLostListeners.delete(listener);
}

export function isAuthenticationError(error) {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors.some((graphqlError) =>
      graphqlError.extensions?.code === "UNAUTHENTICATED" ||
      graphqlError.message === "Authentication required",
    );
  }
  return ServerError.is(error) && error.statusCode === 401;
}

// ---- Links ---------------------------------------------------------------
const errorLink = onError(({ error }) => {
  if (isAuthenticationError(error)) {
    // Wipe cached data (including passport/visa PII) and tell the UI
    client.clearStore().catch((error) => {
      console.error("Could not clear the GraphQL cache after authentication was lost.", error);
    });
    authLostListeners.forEach((fn) => fn());
  }
});

const httpLink = new HttpLink({
  uri: GRAPHQL_ENDPOINT,
  credentials: "include",
  headers: { "X-Requested-By": "frro-extension" } // basic CSRF guard, validate on server
});

// ---- Client ----------------------------------------------------------------
// no-cache: never serve login state or customer data from memory,
// always ask the server. This fixes "still logged in until I reopen".
export const client = new ApolloClient({
  link: from([errorLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    query: { fetchPolicy: "no-cache" },
    watchQuery: { fetchPolicy: "no-cache" },
    mutate: { fetchPolicy: "no-cache" }
  }
});

// Kept so existing code that calls createGraphqlClient() still works.
// It returns the one shared client instead of creating a new one each time.
export function createGraphqlClient() {
  return client;
}

// ---- Operations ----------------------------------------------------------------
export const LOGIN_MUTATION = gql`
  mutation LoginAdmin($email: String!, $password: String!) {
    loginAdmin(email: $email, password: $password) {
      user { id name email role }
    }
  }
`;

export const ME_QUERY = gql`
  query Me {
    me { id name email role }
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