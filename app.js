var mubsub = require('mubsub');
var client = mubsub('mongodb://swalo:84kAanan@ds051658.mongolab.com:51658/swalo');




var addonChannel = client.channel('addons');
var responseChannel = client.channel('searchdata');

client.on('error', console.error);
addonChannel.on('error', console.error);
responseChannel.on('error', console.error);

responseChannel.subscribe('SkyscannerResponse', function (message) {
    console.log("Aggregating data for SessionKey: " + message.SessionKey);
    var resss = GetData(message);

    if(resss === undefined)
        return;
    
    resss.forEach(function(item) {
        console.log("Sending item to mongolab: ")
        addonChannel.publish("NewAddon", item);
    });
});


function GetData(res) {
    //Get SwaloRequestId
    var SwaloQuoteRequests = res.QuoteRequests.filter(function (item) {
        return item.AgentId == 'swlo';
    });

    if(SwaloQuoteRequests.length == 0)
        return;


    var SwaloQuoteRequestId = SwaloQuoteRequests[0].Id;
    console.log("Found Quote RequestId: " + SwaloQuoteRequestId);
    var ress = res;

    var quotePriceById = {};

    for (var i = res.Quotes.length - 1; i >= 0; i--)
        quotePriceById[res.Quotes[i].Id] = {
            Price: res.Quotes[i].Price,
            IsSwaloQuote: res.Quotes[i].QuoteRequestId == SwaloQuoteRequestId
        }

    var that = res;

    var itineraries = res.Itineraries.map(function (itinerary) {

        var QuoteIds = itinerary.PricingOptions.reduce(function (a, b, index, array) {
            if(b.QuoteIds == undefined)
                    return a;
                return a.concat(b.QuoteIds);
        },[]);

        var itineraryPrices = QuoteIds.map(function (quoteId) {
            return quotePriceById[quoteId];
        })

        itineraryPrices = itineraryPrices.sort(function (a, b) {
            return a.Price - b.Price;
        });

        var swaloPrices = itineraryPrices.filter(function (price) {
            return price.IsSwaloQuote;
        });

        itinerary.SwaloPrice = swaloPrices.length > 0 ?
            swaloPrices[0].Price : undefined;
        
        //there is only one price returned for that itienrary
        if(itineraryPrices.length == 0)
            return undefined;

        if(itineraryPrices.length == 1)
            itinerary.BestCompetitorPrice = itineraryPrices[0].Price;
        else
            itinerary.BestCompetitorPrice = itineraryPrices[0].Price == itinerary.SwaloPrice ?
                itineraryPrices[1].Price : itineraryPrices[0].Price ;

        //Outbound och Inbound flight information
        itinerary.OutboundItineraryLeg = that.OutboundItineraryLegs.filter(function(outboundItineraryLeg) {
            return itinerary.OutboundLegId == outboundItineraryLeg.Id;
        })[0];

        itinerary.InboundItineraryLeg = that.InboundItineraryLegs.filter(function(inboundItineraryLeg) {
            return itinerary.InboundLegId == inboundItineraryLeg.Id;
        })[0];

        itinerary.Duration = itinerary.OutboundItineraryLeg.Duration + 
            itinerary.InboundItineraryLeg.Duration;

        return itinerary;
    });

    console.log("Found Itineraries: " + itineraries.length);

    //Clean all undefined itineraries
    itineraries = itineraries.filter(function(item) {
        return item != undefined;
    })

    //Only care about the first 10 itineraries (Skyscanner page 1)
    
    itineraries = itineraries.sort(function(a,b) {
        return a.BestCompetitorPrice - b.BestCompetitorPrice;
    }).slice(0,30);
    

    if(itineraries.length == 0)
        return;
    
    //Prepare Results, ToDest, FromDest, ToDate, FromDate, 
    //På varje SwaloItinerary, Sätt SwaloPosition, SwaloPrice, BestPrice
    var searchData = {};

    //Best Price On Search
    searchData.BestCompetitorPrice = itineraries.sort(function(a,b) {
        return a.BestCompetitorPrice - b.BestCompetitorPrice;
    })[0].BestCompetitorPrice;

    //Best Duration On Search
    searchData.BestDuration = itineraries.sort(function(a,b) {
        return a.Duration - b.Duration;
    })[0].Duration;
    
    
    var swaloItineraries = itineraries.filter(function(item) {
        return item.SwaloPrice != undefined;
    });    

    console.log("Found SwaloItineraries: " + swaloItineraries.length); 

    if(swaloItineraries.length > 0)
    {
        //Best SwaloPrice On Search
        searchData.BestSwaloPrice = swaloItineraries.sort(function(a,b) {
            return a.SwaloPrice - b.SwaloPrice;
        })[0].SwaloPrice;

        //Best SwaloDuration On Search
        searchData.BestSwaloDuration = swaloItineraries.sort(function(a,b) {
            return a.Duration - b.Duration;
        })[0].Duration;
    }
    
    searchData.Origin = res.Query.OriginPlace;
    searchData.Dest = res.Query.DestinationPlace;
    searchData.FromDate = res.Query.OutboundDate;
    searchData.ToDate = res.Query.InboundDate;
    searchData.ItineraryCount = res.Itineraries.length;
    searchData.Itineraries = itineraries;
    searchData.SearchDate = res.SearchDate;

    var isSwaloSearch = searchData.Itineraries.some(function(item) {
        return item.SwaloPrice != undefined;
    });

    //stop if this is not a swalo searchData
    if(isSwaloSearch == false)
        return;

    //2nd Part Get out th itineraries and present on one line for report
    var res = searchData.Itineraries.map(function(item) {
        if(item.SwaloPrice == undefined)
            return;

        var res = {};

        res.EntireSearchBestCompetitorPrice = searchData.BestCompetitorPrice;
        res.EntireSearchBestDuration = searchData.BestSwaloDuration;

        res.EntireSearchBestSwaloPrice = searchData.BestSwaloPrice;
        res.EntireSearchBestSwaloDuration = searchData.BestSwaloDuration;

        res.BestCompetitorPrice = item.BestCompetitorPrice;
        res.Duration = item.Duration;
        res.SwaloPrice = item.SwaloPrice;

        res.SearchMarkup = searchData.BestSwaloPrice - searchData.BestCompetitorPrice;
        res.ItineraryMarkup = item.SwaloPrice - item.BestCompetitorPrice;

        res.OutboundItineraryLegMarketingCarrierIds = item.OutboundItineraryLeg.MarketingCarrierIds.join(',');
        res.InboundItineraryLegMarketingMarketingCarrierIdss = item.InboundItineraryLeg.MarketingCarrierIds.join(',');

        res.OutboundItineraryLegOperatingCarrierIds = item.OutboundItineraryLeg.OperatingCarrierIds.join(',');
        res.InboundItineraryLegMarketingOperatingCarrierIdss = item.InboundItineraryLeg.OperatingCarrierIds.join(',');

        res.OutboundItineraryLegStops = item.OutboundItineraryLeg.StopsCount;
        res.InboundItineraryLegStops = item.InboundItineraryLeg.StopsCount;

        res.OutboundItineraryLegDepartureDateTime = item.OutboundItineraryLeg.DepartureDateTime;
        res.OutboundItineraryLegArrivalDateTime = item.OutboundItineraryLeg.ArrivalDateTime;

        res.InboundItineraryLegDepartureDateTime = item.InboundItineraryLeg.DepartureDateTime;
        res.InboundItineraryLegArrivalDateTime = item.InboundItineraryLeg.ArrivalDateTime;

        res.Origin = ress.Stations.filter(function(station) {
            return station.Id == item.OutboundItineraryLeg.OriginStation;
        })[0].Code;

        res.Dest = ress.Stations.filter(function(station) {
            return station.Id == item.OutboundItineraryLeg.DestinationStation;
        })[0].Code;

        res.FromDate = this.OutboundItineraryLegDepartureDateTime;
        res.ToDate = this.InboundItineraryLegArrivalDateTime;
        res.SearchDate = searchData.SearchDate;

        if(res.ItineraryMarkup > 10.0)
            return undefined;

        res.ItineraryMarkup = res.ItineraryMarkup * -1 - 0.1;
        return res;
    });

    console.log("Res.length");
    console.log(res.length);

    //Clean all undefined ress
    res = res.filter(function(item) {
        return item != undefined;
    });

    console.log("Res.length not undifined");
    console.log(res.length);

    return res;
}

