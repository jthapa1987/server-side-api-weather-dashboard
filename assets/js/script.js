// DOM elements
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiStatusMsg = document.getElementById('apiStatusMsg');
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const historyContainer = document.getElementById('historyContainer');
const currentWeatherSection = document.getElementById('currentWeatherSection');
const forecastContainer = document.getElementById('forecastContainer');

// global state
let currentApiKey = '';
let searchHistory = [];      // store city names (strings)

// ======================== LOCAL STORAGE ========================
function loadStoredData() {
  // load API key
  const savedKey = localStorage.getItem('weather_api_key');
  if (savedKey) {
    currentApiKey = savedKey;
    apiKeyInput.value = savedKey;
    apiStatusMsg.innerHTML = '✅ API key loaded. You can now search cities.';
    apiStatusMsg.style.color = '#166534';
  } else {
    currentApiKey = '';
    apiStatusMsg.innerHTML = '⚠️ No API key saved. Please enter your OpenWeather API key.';
    apiStatusMsg.style.color = '#b91c1c';
  }
  
  // load search history
  const storedHistory = localStorage.getItem('weather_search_history');
  if (storedHistory) {
    try {
      searchHistory = JSON.parse(storedHistory);
      if (!Array.isArray(searchHistory)) searchHistory = [];
    } catch(e) { searchHistory = []; }
  } else {
    searchHistory = [];
  }
  
  // filter out any invalid entries (null, undefined, non-strings)
  searchHistory = searchHistory.filter(city => city && typeof city === 'string');
  saveHistoryToLocal(); // clean up localStorage
  renderHistoryButtons();
  
  // if history exists and we have an API key, load last searched (first element)
  if (searchHistory.length > 0 && currentApiKey) {
    const lastCity = searchHistory[0];
    fetchWeatherForCity(lastCity);
  } else if (searchHistory.length === 0 && currentApiKey) {
    displayEmptyState("Enter a city name and hit search");
  } else if (!currentApiKey) {
    displayEmptyState("🔑 Please set your OpenWeather API key first");
  }
}

function saveApiKeyToLocal(key) {
  localStorage.setItem('weather_api_key', key);
  currentApiKey = key;
  apiStatusMsg.innerHTML = '✅ API key saved successfully! You can now search.';
  apiStatusMsg.style.color = '#166534';
}

function saveHistoryToLocal() {
  localStorage.setItem('weather_search_history', JSON.stringify(searchHistory));
}

// update history UI
function renderHistoryButtons() {
  if (!historyContainer) return;
  historyContainer.innerHTML = '';
  if (searchHistory.length === 0) {
    historyContainer.innerHTML = '<div style="color:#6c757d; font-size:0.8rem;">No cities yet. Search above!</div>';
    return;
  }
  searchHistory.forEach(city => {
    const btn = document.createElement('button');
    btn.textContent = city;
    btn.classList.add('history-btn');
    btn.addEventListener('click', () => {
      if (!currentApiKey) {
        showInlineError('currentWeatherSection', '⚠️ Please save an API key before searching city history.');
        return;
      }
      fetchWeatherForCity(city);
    });
    historyContainer.appendChild(btn);
  });
}

// add city to history (avoid duplicates, keep at front)
function addCityToHistory(cityName) {
  if (!cityName || typeof cityName !== 'string') return;
  // remove existing occurrence
  const filtered = searchHistory.filter(c => c.toLowerCase() !== cityName.toLowerCase());
  filtered.unshift(cityName);
  searchHistory = filtered.slice(0, 12);   // keep max 12 cities
  saveHistoryToLocal();
  renderHistoryButtons();
}

// helper: show error on main content
function showInlineError(containerId, message) {
  if (containerId === 'currentWeatherSection') {
    currentWeatherSection.innerHTML = `<div class="current-card" style="background:#ffe6e6;"><div class="city-name">⚠️ Error</div><div>${message}</div></div>`;
  } else if (containerId === 'forecast') {
    forecastContainer.innerHTML = `<div class="forecast-card" style="grid-column:span 3;">${message}</div>`;
  }
}

function displayEmptyState(msg) {
  currentWeatherSection.innerHTML = `<div class="current-card" style="text-align:center;"><div class="city-name">🌎 Weather Ready</div><div>${msg}</div></div>`;
  forecastContainer.innerHTML = `<div class="forecast-card">📌 5-day forecast will show after search</div>`;
}

// UV Index color mapping
function getUvIndexClass(uvi) {
  if (uvi <= 2) return 'uv-favorable';
  if (uvi <= 5) return 'uv-moderate';
  if (uvi <= 7) return 'uv-high';
  if (uvi <= 10) return 'uv-very-high';
  return 'uv-extreme';
}

// Format date from unix timestamp (local user format)
function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getMonth()+1}/${date.getDate()}/${date.getFullYear()}`;
}

// display current weather + UV index + icon
function displayCurrentWeather(data, cityDisplayName) {
  const current = data.current;
  const timezoneOffset = data.timezone_offset;
  const dt = current.dt;
  const dateStr = formatDate(dt);
  const iconCode = current.weather[0].icon;
  const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  const temp = current.temp;
  const wind = current.wind_speed;
  const humidity = current.humidity;
  const uvi = current.uvi;
  const uvClass = getUvIndexClass(uvi);
  
  const weatherHTML = `
    <div class="current-card">
      <div class="city-header">
        <span class="city-name">${cityDisplayName}</span>
        <span class="current-date">${dateStr}</span>
        <div class="weather-icon"><img src="${iconUrl}" alt="${current.weather[0].description}" width="50" height="50"></div>
      </div>
      <div class="weather-main">
        <div class="temp-info">🌡️ ${temp}°F</div>
        <div class="details">
          <div class="detail-item">💨 Wind: ${wind} MPH</div>
          <div class="detail-item">💧 Humidity: ${humidity}%</div>
          <div class="detail-item">☀️ UV Index: <span class="uv-box ${uvClass}">${uvi}</span></div>
        </div>
      </div>
      <div style="margin-top:12px;"><small>${current.weather[0].description}</small></div>
    </div>
  `;
  currentWeatherSection.innerHTML = weatherHTML;
}

// display 5-day forecast (daily data from onecall, index 1 to 5)
function displayForecast(weatherData) {
  if (!weatherData.daily || weatherData.daily.length < 2) {
    forecastContainer.innerHTML = `<div class="forecast-card">Incomplete forecast data</div>`;
    return;
  }
  // take days 1 through 5 (tomorrow + 4 more)
  const fiveDays = weatherData.daily.slice(1, 6);
  let cardsHtml = '';
  for (let day of fiveDays) {
    const dateStr = formatDate(day.dt);
    const iconCode = day.weather[0].icon;
    const iconUrl = `https://openweathermap.org/img/wn/${iconCode}.png`;
    const dayTemp = day.temp.day;      // °F
    const windSpeed = day.wind_speed;
    const humidity = day.humidity;
    cardsHtml += `
      <div class="forecast-card">
        <div class="forecast-date">${dateStr}</div>
        <div class="forecast-icon"><img src="${iconUrl}" alt="forecast icon"></div>
        <div class="forecast-temp">${dayTemp}°F</div>
        <div class="forecast-detail">💨 ${windSpeed} MPH</div>
        <div class="forecast-detail">💧 ${humidity}%</div>
      </div>
    `;
  }
  forecastContainer.innerHTML = cardsHtml;
}

// fetch geocoding + onecall orchestration
async function fetchWeatherForCity(cityName) {
  // Guard against undefined, null, or empty cityName
  if (!cityName || typeof cityName !== 'string' || !cityName.trim()) {
    showInlineError('currentWeatherSection', 'Please enter a valid city name.');
    forecastContainer.innerHTML = '<div class="forecast-card">❌ No valid city provided</div>';
    return;
  }
  
  if (!currentApiKey) {
    showInlineError('currentWeatherSection', '❌ No API key. Please set and save your OpenWeather API key first.');
    forecastContainer.innerHTML = '<div class="forecast-card">🔑 API key required for forecast</div>';
    return;
  }
  
  const trimmedCity = cityName.trim();
  
  // show loading state
  currentWeatherSection.innerHTML = `<div class="current-card"><div class="city-name">⏳ Loading weather for ${trimmedCity}...</div></div>`;
  forecastContainer.innerHTML = `<div class="forecast-card">⏳ Fetching 5-day forecast...</div>`;

  try {
    // 1. Geocoding API (direct)
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(trimmedCity)}&limit=1&appid=${currentApiKey}`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) throw new Error(`Geocoding error ${geoRes.status}`);
    const geoData = await geoRes.json();
    if (!geoData || geoData.length === 0) {
      throw new Error(`City "${trimmedCity}" not found. Please check spelling.`);
    }
    const { lat, lon, name, country } = geoData[0];
    const displayCity = country ? `${name}, ${country}` : name;

    // 2. One Call API 3.0 (updated from 2.5)
    const oneCallUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly&units=imperial&appid=${currentApiKey}`;
    const weatherRes = await fetch(oneCallUrl);
    if (!weatherRes.ok) {
      let errMsg = `OneCall error ${weatherRes.status}`;
      if (weatherRes.status === 401) errMsg = 'Invalid API key or unauthorized. Please check your OpenWeather key and ensure OneCall 3.0 is activated.';
      throw new Error(errMsg);
    }
    const weatherData = await weatherRes.json();
    if (!weatherData.current || !weatherData.daily) {
      throw new Error('Unexpected API response structure.');
    }

    // success: display data & update history
    displayCurrentWeather(weatherData, displayCity);
    displayForecast(weatherData);
    addCityToHistory(displayCity);
  } catch (error) {
    console.error(error);
    let errorMsg = error.message;
    if (errorMsg.includes('401')) errorMsg = 'API key invalid or OneCall 3.0 not activated. Please verify subscription.';
    showInlineError('currentWeatherSection', `⚠️ ${errorMsg}`);
    forecastContainer.innerHTML = `<div class="forecast-card">Could not load forecast: ${errorMsg.substring(0, 80)}</div>`;
  }
}

// ------------- EVENT HANDLERS -------------
saveApiKeyBtn.addEventListener('click', () => {
  const newKey = apiKeyInput.value.trim();
  if (newKey === "") {
    apiStatusMsg.innerHTML = '❌ Please enter a valid API key.';
    apiStatusMsg.style.color = '#b91c1c';
    return;
  }
  saveApiKeyToLocal(newKey);
  // after key save, if we have history but no weather shown, optionally reload first city
  if (searchHistory.length > 0 && (currentWeatherSection.innerText.includes('Ready') || currentWeatherSection.innerText.includes('API key'))) {
    fetchWeatherForCity(searchHistory[0]);
  } else if (searchHistory.length === 0) {
    displayEmptyState("API key saved! Enter a city and hit Search.");
  } else {
    // if we already have valid weather with old key? just refresh show?
    if (searchHistory.length) fetchWeatherForCity(searchHistory[0]);
  }
});

searchBtn.addEventListener('click', () => {
  const city = cityInput.value.trim();
  if (!city) {
    showInlineError('currentWeatherSection', 'Please type a city name.');
    return;
  }
  if (!currentApiKey) {
    showInlineError('currentWeatherSection', '🔐 Please set and save your OpenWeather API key first (top left).');
    return;
  }
  fetchWeatherForCity(city);
});

cityInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    searchBtn.click();
  }
});

// initial load
loadStoredData();