import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";
import { SetContextLink } from "@apollo/client/link/context";
import { getAuthHeaders } from "../config.js";

export const GRAPHQL_ENDPOINT = "http://localhost:4000/graphql";

export function createGraphqlClient(token) {
  const authLink = new SetContextLink((previousContext) => ({
    headers: {
      ...previousContext.headers,
      ...getAuthHeaders(token),
    },
  }));
  const httpLink = new HttpLink({ uri: GRAPHQL_ENDPOINT });

  return new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache(),
  });
}

export const LOGIN_MUTATION = gql`
  mutation LoginAdmin($email: String!, $password: String!) {
    loginAdmin(email: $email, password: $password) {
      token
      user { id name email role }
    }
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
