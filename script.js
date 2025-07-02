document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('name-input');
    const analyzeButton = document.getElementById('analyze-button');
    const loader = document.getElementById('loader');
    const dashboard = document.getElementById('dashboard');
    const errorContainer = document.getElementById('error-container');
    const githubCheckbox = document.getElementById('github-checkbox');
    const kaggleCheckbox = document.getElementById('kaggle-checkbox');
    const manualToggle = document.getElementById('manual-toggle');
    const manualInputs = document.getElementById('manual-inputs');
    const githubLinkInput = document.getElementById('github-link-input');
    const kaggleLinkInput = document.getElementById('kaggle-link-input');

    const DEVMAP_API_BASE_URL = 'http://localhost:8000'; // FastAPI adresiniz

    analyzeButton.addEventListener('click', handleAnalysis);

    nameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') handleAnalysis();
    });

    manualToggle.addEventListener('click', (e) => {
        e.preventDefault();
        manualInputs.classList.toggle('hidden');
    });

    async function handleAnalysis() {
        resetUI();

        const githubChecked = githubCheckbox.checked;
        const kaggleChecked = kaggleCheckbox.checked;

        if (!githubChecked && !kaggleChecked) {
            showError("Lütfen analiz için en az bir platform seçin.");
            return;
        }

        loader.classList.remove('hidden');

        try {
            if (githubChecked) {
                const usernameOrLink = nameInput.value.trim(); // "Ad Soyad" veya kullanıcı adı
                const githubManualLink = githubLinkInput.value.trim(); // Manuel link

                let userInputForBackend;
                let platformToAnalyze = "github";

                // Manuel link girildiyse, ondan kullanıcı adını çıkar
                if (githubManualLink) {
                    try {
                        const url = new URL(githubManualLink);
                        if (url.hostname === 'github.com') {
                            userInputForBackend = url.pathname.split('/')[1];
                            if (!userInputForBackend) {
                                throw new Error("Geçersiz GitHub linki. Kullanıcı adı bulunamadı.");
                            }
                        } else {
                            throw new Error("Geçersiz GitHub linki. Lütfen 'github.com' adresli bir link girin.");
                        }
                    } catch (e) {
                        showError(e.message);
                        return;
                    }
                } else if (usernameOrLink) {
                    // Sadece "Ad Soyad" veya kullanıcı adı girildiyse
                    userInputForBackend = usernameOrLink;
                } else {
                    showError("Lütfen bir Geliştirici Adı veya geçerli bir GitHub linki girin.");
                    return;
                }

                // Backend'e analizi başlatması için tek bir istek gönder
                const analyzedData = await fetchAnalysisFromBackend(platformToAnalyze, userInputForBackend);
                displayDashboard(analyzedData);
            }

            if (kaggleChecked) {
                // TODO: Kaggle analizi için benzer mantığı uygulayın.
                // Örneğin: const kaggleUsername = getKaggleUsername();
                // const kaggleData = await fetchAnalysisFromBackend("kaggle", kaggleUsername);
                console.log("Kaggle analizi isteniyor...");
            }

        } catch (error) {
            console.error("Analiz hatası:", error);
            showError(error.message || "Bilinmeyen bir hata oluştu.");
        } finally {
            loader.classList.add('hidden');
        }
    }

    // Backend'e analiz isteği gönderen ana fonksiyon
    async function fetchAnalysisFromBackend(platform, userinput) {
        const url = `${DEVMAP_API_BASE_URL}/api/analyze/${platform}/${encodeURIComponent(userinput)}`;

        const response = await fetch(url, {
            method: "POST"
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: "Bilinmeyen sunucu hatası" }));
            throw new Error(`Analiz başarısız oldu: ${response.status} - ${errorData.detail || response.statusText}`);
        }
        return response.json();
    }

    // Eski GitHub API çağırma ve analiz fonksiyonları artık kullanılmayacak
    // async function fetchUserData(username) { ... }
    // async function fetchReposData(username) { ... }
    // function analyzeGitHubData(userData, reposData) { ... }

    // ... (displayDashboard, createLanguageChart, showError, resetUI fonksiyonları aynı kalacak) ...

    function displayDashboard(data) {
        document.getElementById('user-avatar').src = data.avatar_url;
        document.getElementById('user-name').textContent = data.name;
        document.getElementById('user-login').textContent = `@${data.login}`;
        document.getElementById('user-bio').textContent = data.bio;
        document.getElementById('profile-link').href = data.html_url;
        document.getElementById('repo-count').textContent = data.public_repos;
        document.getElementById('follower-count').textContent = data.followers;
        document.getElementById('following-count').textContent = data.following;
        document.getElementById('star-count').textContent = data.total_stars;

        createLanguageChart(data.languages);
        dashboard.classList.remove('hidden');
    }

    function createLanguageChart(languages) {
        const chartContainer = document.getElementById('language-chart-container');
        chartContainer.innerHTML = ''; // Önceki grafiği temizle

        if (Object.keys(languages).length === 0) {
            chartContainer.textContent = "Gösterilecek dil verisi bulunamadı.";
            return;
        }

        const sortedLanguages = Object.entries(languages).sort(([, a], [, b]) => b - a).slice(0, 7);
        const data = [{
            values: sortedLanguages.map(lang => lang[1]),
            labels: sortedLanguages.map(lang => lang[0]),
            type: 'pie', hole: 0.4, textinfo: "percent",
            textfont: { size: 14, color: '#ffffff' },
            marker: { colors: ['#4299e1', '#63b3ed', '#4fd1c5', '#68d391', '#f6e05e', '#f56565', '#ed8936'] }
        }];
        const layout = {
            title: '', showlegend: true,
            legend: { font: { color: 'var(--primary-text-color)' }, x: 1, xanchor: 'right', y: 1 },
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            height: 400, margin: { t: 0, b: 0, l: 0, r: 0 }
        };
        Plotly.newPlot(chartContainer, data, layout, {responsive: true});
    }

    function showError(message) {
        errorContainer.textContent = message;
        errorContainer.classList.remove('hidden');
    }

    function resetUI() {
        dashboard.classList.add('hidden');
        errorContainer.classList.add('hidden');
    }
});