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
        const wikipediaAlgorithm = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2?timeout=300');
        const wikipediaResponse = await wikipediaAlgorithm.pipe(content.searchTerm);
        console.log(wikipediaResponse);
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


/* Explica????o: Esse ?? o robo respons??vel por pesquisar o que queremos l?? no wikipedia, limpar e quebrar em senten??as. */

/* 1 -> A fun????o fetchContentFromWikipedia ?? respons??vel por buscar o que queremos l?? no wikipedia, para isso usamos uma api do pessoal da Algorithmia chamada WikipediaParser. Para usar ela basta instalar ela nas nossas dependencias com o npm install algorithmia e depois importar para ca usando require('algorithmia'). Dai atraves do algorithmiaAuthenticated n??s pedimos uma autentica????o para conseguirmos acessar os algoritimos deles (atraves de uma chave que eles disponibilizam em api keys dentro da nossa conta, claro), conseguimos usar esses algoritimos atravez da fun????o algo() e com isso ele me retorna uma instancia do algoritimo e dentro dessa instancia do algoritimo no caso wikipediaParser ele tem o metodo pipe() que recebe como parametro  o conte??do que quermos buscar no wikipedia. Conseguimos pegar o conte??do dessa busca atraves do m??todo get(). Pelo m??todo pipe ser uma promisse e eu precisar do seu resultado para continuar, eu preciso que ele pare de ser assincrono e passe a ser sincrono, dessa forma eu utilizo o await que ele entra nessa fun????o assincrona e s?? continua quando ela terminar. */

/* 2 -> Essa fun????o sanitizedContent ?? a que eu trato o meu texto para ele ficar como eu preciso. Na fun????o removeBlankLinesAndMarkdown eu removo as linhas em branco que ele tem e as marca????es dos t??tulos que o wikipedia tem, no caso s??o simbolos de iguai = */

/* 3 -> Aqui eu pego todo aquele texto j?? sanitizado e separo em senten??as. Por??m uma senten??a n??o ?? onde tem um ponto final, sen??o uma sigla por exemplo C.I.A seria cada letra uma senten??a. Para dividir nosso texto em senten??as que fa??am sentido utilizamos a biblioteca sentence Boundary Detection (sbd) que sabe identificar quando come??a e quando termina uma senten??a. Dai com esse resultado eu coloquei dentro de um objeto em content.sentences e dentro desse objeto eu tenho para cada senten??a uma keyword e um array de imagens. */