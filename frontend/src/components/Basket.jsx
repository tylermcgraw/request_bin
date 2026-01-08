import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import services from '../services/services';
import Request from './Request';
import CopyButton from './CopyButton';
import Notification from './Notification';

const Basket = ({ setBaskets }) => {
  const urlEndpoint = useParams().urlEndpoint;
  const navigate = useNavigate();
  const [requests, setRequests] = useState(null);
  const webSocketReference = useRef(null);
  const [webSocketEnabled, setWebSocketEnabled] = useState(true);
  const [message, setMessage] = useState({ text: null, type: null });

  const uri = `${window.location.origin}/api/${urlEndpoint}`;
  // Use custom WebSocket domain
  const WS_URL = 'wss://ws.request-b.in';

  const autoRefreshLabel = webSocketEnabled ? 'Disable auto-refresh' : 'Enable auto-refresh';

  const getRequestsHook = useCallback(() => {
    services.getRequests(urlEndpoint)
      .then(setRequests)
      .catch((error) => {
        if (error.response?.status === 404) {
          setMessage({ text: 'Error! Not found.', type: 'error' });
          setTimeout(() => {
            navigate('/');
          }, 3000);
        } else {
          console.error('Error fetching requests:', error);
        }
      });
  }, [urlEndpoint, navigate]);

  useEffect(() => {
    getRequestsHook();

    if (webSocketEnabled && !webSocketReference.current) {
      // API Gateway WS uses query params for custom data on connect
      const socket = new WebSocket(`${WS_URL}?basket_id=${urlEndpoint}`);

      socket.onopen = () => {
        console.log('WebSocket connected');
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'new_request') {
            setRequests(previous => [message.data, ...previous, ]);
          }
        } catch (e) {
          console.error("Failed to parse WS message", e);
        }
      };

      socket.onclose = () => {
        console.log('WebSocket closed');
        webSocketReference.current = null;
      };

      webSocketReference.current = socket;

      return () => {
        if (socket.readyState === 1) { // OPEN
            socket.close();
        }
      };
    }
  }, [getRequestsHook, webSocketEnabled, urlEndpoint, WS_URL]);

  const deleteBasket = () => {
    services.deleteBasket(urlEndpoint)
      .then(() => {
        setBaskets(baskets => baskets.filter((basket) => basket !== urlEndpoint));
        console.log('Basket deleted successfully!');
      })
      .catch((error) => {
        if (error.response?.status === 404) {
          console.log('The basket does not exist!');
        } else {
          console.error(`Unexpected error: ${error.message}`);
        }
      })
      .finally(() => {
        navigate('/');
      });
  };

  const clearBasket = () => {
    services.clearBasket(urlEndpoint)
      .then(() => {
        setRequests([]);
        setMessage({ text: 'The basket has been successfully cleared!', type: 'success' });
        setTimeout(() => setMessage({ text: null, type: null }), 5000);
      })
      .catch(() => {
        setMessage({ text: 'Your basket is empty! Nothing to clear.', type: 'error' });
        setTimeout(() => setMessage({ text: null, type: null }), 5000);
      });
  };

  const refreshBasket = () => getRequestsHook();

  const toggleAutoRefresh = () => {
    if (webSocketEnabled) {
      if (webSocketReference.current) {
        webSocketReference.current.close();
        webSocketReference.current = null;
      }
      setWebSocketEnabled(false);
    } else {
      setWebSocketEnabled(true);
    }
  };

  return (
    <div>
      <h1>Basket: {urlEndpoint}</h1>
      <Notification message={message.text} className={message.type}/>
      { requests
        ? <div>
            <div className='uri-container'>
              <span>
                Send requests at <kbd>{uri}</kbd>
              </span>
              <CopyButton text={uri} />
            </div>
            <div>
              <button type='button' className='basket-button' onClick={deleteBasket}>
                <span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-icon lucide-trash"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span>
                Delete basket
              </button>
              <button type='button' className='basket-button' onClick={clearBasket}>
                <span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser-icon lucide-eraser"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/></svg></span>
                Clear basket
              </button>
              <button type='button' className='basket-button' onClick={refreshBasket}>
                <span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw-icon lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></span>
                Refresh basket
              </button>
              <button type='button' className='basket-button' onClick={toggleAutoRefresh}>
                <span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-ccw-icon lucide-refresh-ccw"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg></span>
                {autoRefreshLabel}
              </button>
            </div>
            <div>
              { requests.length > 0
                ? <>
                    <p><strong>Total requests: {requests.length}</strong></p>
                    <div>
                      {requests.map((request) => {
                        return <Request key={JSON.stringify(request)} request={request} />
                      })}
                    </div>
                  </>
                : <>
                    <h3 className='empty-basket'>Empty basket</h3>
                  </>
              }
            </div>
          </div>
        : <></>
      }
    </div>
  );
};

export default Basket;
