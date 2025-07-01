document.addEventListener('DOMContentLoaded', () => {
    // Gerekli tüm HTML elementlerini seçiyoruz
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

    // Örnek API adresi. Bu, kendi FastAPI backend'inizle değiştirilmelidir.
    const GITHUB_API_BASE_URL = 'https://api.github.com';

    // --- OLAY DİNLEYİCİLERİ ---

    // Analiz butonuna tıklama
    analyzeButton.addEventListener('click', handleAnalysis);
    
    // Enter tuşuna basıldığında analizi tetikle
    nameInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') handleAnalysis();
    });

    // Manuel giriş alanını göster/gizle
    manualToggle.addEventListener('click', (e) => {
        e.preventDefault();
        manualInputs.classList.toggle('hidden');
    });

    // --- ANA FONKSİYONLAR ---

    /**
     * Analiz sürecini başlatan ana fonksiyon
     */
    async function handleAnalysis() {
        resetUI(); // Arayüzü temizle
        
        const githubChecked = githubCheckbox.checked;
        const kaggleChecked = kaggleCheckbox.checked;

        if (!githubChecked && !kaggleChecked) {
            showError("Lütfen analiz için en az bir platform seçin.");
            return;
        }

        loader.classList.remove('hidden'); // Yükleyiciyi göster

        try {
            // Sadece GitHub analizi seçiliyse...
            if (githubChecked) {
                const username = getGitHubUsername();
                if (!username) {
                    throw new Error("Lütfen bir Geliştirici Adı veya geçerli bir GitHub linki girin.");
                }
                
                // Kendi FastAPI backend'inize tek bir istek atacaksınız.
                // Örnek olması açısından doğrudan GitHub API'sine birkaç istek atıyoruz.
                const userData = await fetchUserData(username);
                const reposData = await fetchReposData(username);
                const analyzedData = analyzeGitHubData(userData, reposData);
                displayDashboard(analyzedData);
            }
            
            // Kaggle analizi de eklenebilir
            if (kaggleChecked) {
                // TODO: Kaggle analiz mantığı buraya eklenecek.
                console.log("Kaggle analizi isteniyor...");
            }

        } catch (error) {
            showError(error.message);
        } finally {
            loader.classList.add('hidden'); // Yükleyiciyi gizle
        }
    }

    /**
     * Gerekli GitHub kullanıcı adını manuel linkten veya giriş kutusundan alır.
     */
    function getGitHubUsername() {
        const githubLink = githubLinkInput.value.trim();
        if (githubLink) {
            try {
                const url = new URL(githubLink);
                if (url.hostname === 'github.com') {
                    // Path'ten kullanıcı adını al (/kullaniciadi)
                    return url.pathname.split('/')[1];
                }
            } catch (e) {
                return null; // Geçersiz URL
            }
        }
        return nameInput.value.trim();
    }


    // --- VERİ ÇEKME VE İŞLEME ---

    async function fetchUserData(username) {
        const response = await fetch(`${GITHUB_API_BASE_URL}/users/${username}`);
        if (!response.ok) {
            if (response.status === 404) throw new Error('GitHub kullanıcısı bulunamadı.');
            throw new Error('GitHub API isteği başarısız oldu.');
        }
        return response.json();
    }
    
    async function fetchReposData(username) {
        const response = await fetch(`${GITHUB_API_BASE_URL}/users/${username}/repos?per_page=100`);
        if (!response.ok) return [];
        return response.json();
    }

    function analyzeGitHubData(userData, reposData) {
        const languages = reposData
            .filter(repo => repo.language)
            .reduce((acc, repo) => {
                acc[repo.language] = (acc[repo.language] || 0) + 1;
                return acc;
            }, {});
        
        const totalStars = reposData.reduce((acc, repo) => acc + repo.stargazers_count, 0);

        return {
            avatar_url: userData.avatar_url,
            name: userData.name || userData.login,
            login: userData.login,
            bio: userData.bio || 'Kullanıcı bir biyografi belirtmemiş.',
            html_url: userData.html_url,
            public_repos: userData.public_repos,
            followers: userData.followers,
            following: userData.following,
            total_stars: totalStars,
            languages: languages
        };
    }

    // --- ARAYÜZ GÜNCELLEME ---

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
