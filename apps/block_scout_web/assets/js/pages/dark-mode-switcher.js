import Cookies from 'js-cookie'
// @ts-ignore
const darkModeChangerEl = document.getElementsByClassName('dark-mode-changer')[0]

$('.dark-mode-changer').click(function () {
  if (localStorage.getItem('current-color-mode') === 'dark') {
    // light
    localStorage.setItem('current-color-mode', 'dark')
  } else {
    Cookies.set('chakra-ui-color-mode', 'dark')
  }
  document.location.reload()
})
