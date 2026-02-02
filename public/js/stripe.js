import axios from 'axios';
import { showAlert } from './alerts';

/* eslint-disable */
// const stripe = Stripe(
//   'pk_test_51SvWxO4WKqucRQyEk4XtfJTXD3kXsmW9Uww8sgjHdNTUE9qwxlQYpxU3lnaZomAZtqCnI6UYg2yt4sauQgHtmgak00SfUdeyom',
// );

export const bookTour = async (tourID) => {
  try {
    // 1) get the checkout session from API
    const session = await axios(
      `/api/v1/bookings/checkout-session/${tourID}`,
    );

    // 2) create checkout form + charge credit card
    // Stripe giờ trả về URL
    window.location.href = session.data.url;
  } catch (error) {
    console.log(error);
    showAlert('error', error);
  }
};
