import { mergeProps } from 'vue';

// ARIA-disabled buttons remain focusable, but cannot activate or submit a form.
export function nativeButtonAttrs(attrs, disabled = false) {
  const blocked =
    disabled ||
    attrs['aria-disabled'] === true ||
    attrs['aria-disabled'] === 'true';
  function guardActivation(event) {
    if (
      blocked &&
      (event.type === 'click' || event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  return mergeProps(
    {
      onClickCapture: guardActivation,
      onKeydownCapture: guardActivation,
      onKeyupCapture: guardActivation,
    },
    attrs,
  );
}
