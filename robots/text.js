const algorithmia = require('algorithmia');
const algorithmiaApiKey = require('../credentials/algorithmia.json').apiKey;
const sentenceBoundaryDetection = require('sbd');

const watsonApiKey = require('../credentials/watson-nlu.json').apikey;
const NaturalLanguageUndersatndingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js')

const nlu = new NaturalLanguageUndersatndingV1({
    iam_apikey: watsonApiKey,
    version: '2018-04-05',
    url: 'https://gateway.watsonplatform.net/natural-language-understanding/api/'
})

const state = require('./state.js');

async function robot() {
    const content = state.load();
    await fetchContentFromWikipedia(content);
    sanitizedContent(content);
    breakContentIntoSentences(content);
    limitMaximumSentences(content);
    await fetchKeywordsOfAllSentences(content);

    state.save(content);

    async function fetchContentFromWikipedia(content) {  // 1
        const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey);
        const wikipediaAlgorithm = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2');
        const wikipediaResponse = await wikipediaAlgorithm.pipe(content.searchTerm);
        const wikipediaContent = wikipediaResponse.get();
        
        content.sourceContentOriginal = wikipediaContent.content;
    }

    function sanitizedContent(content) {  // 2
        const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal);
        const withoutDatesInParentheses = removeDatesInParentheses(withoutBlankLinesAndMarkdown);
        
        content.sourceContentSanitized = withoutDatesInParentheses;

        function removeBlankLinesAndMarkdown(text) {
            const allLines = text.split('\n');

            const withoutBlankLinesAndMarkdown = allLines.filter((line) => {
                if(line.trim().length === 0 || line.trim().startsWith('=')) {
                    return false;
                }
                return true;
            });
            return withoutBlankLinesAndMarkdown.join(' ');
        }

        function removeDatesInParentheses(text) {
            return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g, ' ');
        }
    }

    function breakContentIntoSentences(content) {  // 3
        content.sentences = [];
        const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSanitized)
        sentences.forEach((sentence) => {
            content.sentences.push({
                text: sentence,
                keywords: [],
                images: []
            });
        });
    }

    function limitMaximumSentences(content) {
        content.sentences = content.sentences.slice(0, content.maximumSentences);
    }

    async function fetchKeywordsOfAllSentences(content) {
        for (const sentence of content.sentences) {
            sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text);
        }
    }

    async function fetchWatsonAndReturnKeywords(sentence) {
        return new Promise((resolve, reject) => {
            nlu.analyze({
                text: sentence,
                features: {
                    keywords: {}
                }
            }, (error, response) => {
                if(error) {
                    throw error;
                }
                
                const keywords = response.keywords.map((keyword) => {
                    return keyword.text;
                })
    
                resolve(keywords);
            })
        });
    }

}

module.exports = robot;


/* Explicação: Esse é o robo responsável por pesquisar o que queremos lá no wikipedia, limpar e quebrar em sentenças. */

/* 1 -> A função fetchContentFromWikipedia é responsável por buscar o que queremos lá no wikipedia, para isso usamos uma api do pessoal da Algorithmia chamada WikipediaParser. Para usar ela basta instalar ela nas nossas dependencias com o npm install algorithmia e depois importar para ca usando require('algorithmia'). Dai atraves do algorithmiaAuthenticated nós pedimos uma autenticação para conseguirmos acessar os algoritimos deles (atraves de uma chave que eles disponibilizam em api keys dentro da nossa conta, claro), conseguimos usar esses algoritimos atravez da função algo() e com isso ele me retorna uma instancia do algoritimo e dentro dessa instancia do algoritimo no caso wikipediaParser ele tem o metodo pipe() que recebe como parametro  o conteúdo que quermos buscar no wikipedia. Conseguimos pegar o conteúdo dessa busca atraves do método get(). Pelo método pipe ser uma promisse e eu precisar do seu resultado para continuar, eu preciso que ele pare de ser assincrono e passe a ser sincrono, dessa forma eu utilizo o await que ele entra nessa função assincrona e só continua quando ela terminar. */

/* 2 -> Essa função sanitizedContent é a que eu trato o meu texto para ele ficar como eu preciso. Na função removeBlankLinesAndMarkdown eu removo as linhas em branco que ele tem e as marcações dos títulos que o wikipedia tem, no caso são simbolos de iguai = */

/* 3 -> Aqui eu pego todo aquele texto já sanitizado e separo em sentenças. Porém uma sentença não é onde tem um ponto final, senão uma sigla por exemplo C.I.A seria cada letra uma sentença. Para dividir nosso texto em sentenças que façam sentido utilizamos a biblioteca sentence Boundary Detection (sbd) que sabe identificar quando começa e quando termina uma sentença. Dai com esse resultado eu coloquei dentro de um objeto em content.sentences e dentro desse objeto eu tenho para cada sentença uma keyword e um array de imagens. */