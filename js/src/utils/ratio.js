export const round = (value, decimals) => {
  if (!decimals) decimals = 0;
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
};
// return two decimal places rounded number
export const ratio = ({ width, height }) => round(width / height, 2);
