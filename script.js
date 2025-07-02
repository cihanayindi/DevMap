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
                const usernameOrSearchTerm = nameInput.value.trim();
                const githubManualLink = githubLinkInput.value.trim();

                let userInputForBackend;
                let inputTypeForBackend = null;

                if (githubManualLink) {
                    // Manuel link senaryosu (Bu kısım zaten doğru çalışıyor)
                    try {
                        const url = new URL(githubManualLink);
                        if (url.hostname === 'github.com' && url.pathname.split('/')[1]) {
                            userInputForBackend = url.pathname.split('/')[1];
                            inputTypeForBackend = 'direct_username';
                        } else {
                            throw new Error();
                        }
                    } catch (e) {
                        showError("Geçersiz GitHub linki. Lütfen geçerli bir profil linki girin.");
                        loader.classList.add('hidden'); // Loader'ı gizle
                        return;
                    }
                } else if (usernameOrSearchTerm) {
                    // --- BURASI YENİ VE GELİŞTİRİLMİŞ MANTIK ---
                    try {
                        // Girdinin bir URL olup olmadığını anlamaya çalış.
                        // Eğer "new URL()" başarısız olursa, catch bloğu çalışır ve bunun bir arama terimi olduğunu anlarız.
                        const url = new URL(usernameOrSearchTerm);

                        // Eğer buraya geldiysek, girdi bir URL demektir.
                        // Şimdi bu URL'in GitHub'a ait olup olmadığını kontrol edelim.
                        if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
                            const username = url.pathname.split('/')[1];
                            if (username) {
                                // DURUM 1: Geçerli bir GitHub linki.
                                userInputForBackend = username;
                                inputTypeForBackend = 'direct_username';
                            } else {
                                // Örneğin: sadece "https://github.com/" girilmiş.
                                throw new Error("Geçersiz GitHub linki. Link bir kullanıcı adı içermiyor.");
                            }
                        } else {
                            // DURUM 2: Geçerli ama GitHub OLMAYAN bir link.
                            showError("Hatalı giriş yaptınız. Lütfen sadece aramak için bir isim ve soyisim girin, eğer elinizde hazır bir bağlantı varsa bunu manuel ekleme kısmından ekleyip burayı boş bırakabilirsiniz.");
                            loader.classList.add('hidden'); // Loader'ı gizle
                            return; // İşlemi tamamen durdur.
                        }
                    } catch (e) {
                        // Eğer "new URL()" başarısız olduysa, bu bir link değildir.
                        // Veya yukarıda fırlattığımız özel hatayı yakaladık.
                        if (e instanceof TypeError) {
                            // DURUM 3: Bu bir link değil, bir arama terimi.
                            userInputForBackend = usernameOrSearchTerm;
                            inputTypeForBackend = null; // Backend'in arama yapmasına izin ver.
                        } else {
                            // "Geçersiz GitHub linki..." gibi özel bir hatayı yakaladık.
                            showError(e.message);
                            loader.classList.add('hidden'); // Loader'ı gizle
                            return;
                        }
                    }
                    // --- YENİ MANTIK SONU ---

                } else {
                    showError("Lütfen bir Geliştirici Adı/Linki girin.");
                    loader.classList.add('hidden'); // Loader'ı gizle
                    return;
                }

                // Eğer userInputForBackend hala tanımsızsa bir sorun vardır, işlemi durdur.
                if (!userInputForBackend) {
                    // Bu normalde olmamalı ama bir güvenlik önlemi.
                    showError("Girdi işlenemedi. Lütfen tekrar deneyin.");
                    loader.classList.add('hidden');
                    return;
                }

                const analyzedData = await fetchAnalysisFromBackend("github", userInputForBackend, inputTypeForBackend);
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
    async function fetchAnalysisFromBackend(platform, userInput, inputType = null) {
        const url = `${DEVMAP_API_BASE_URL}/api/analyze`; // Endpoint artık daha temiz!

        // Gönderilecek veri objesi
        const requestBody = {
            platform: platform,
            user_input: userInput
        };

        // Eğer inputType belirtilmişse, body'e ekle
        if (inputType) {
            requestBody.input_type = inputType;
        }

        const response = await fetch(url, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json', // Body'nin JSON olduğunu belirtiyoruz
            },
            body: JSON.stringify(requestBody) // objeyi JSON string'ine çeviriyoruz
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