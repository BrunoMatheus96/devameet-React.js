import { useEffect, useState } from "react";
import emptyIcon from '../../assets/images/empty_list.svg';
import copyIcon from '../../assets/images/copy.svg';
import { useNavigate, useParams } from "react-router-dom";
import { RoomObjects } from "./RoomObjects";
import { RoomServices } from "../../services/RoomServices";
import { createPeerConnectionContext } from "../../services/WebSocketServices";

import iconUp from '../../assets/images/chevron_up.svg';
import iconLeft from '../../assets/images/chevron_left.svg';
import iconRight from '../../assets/images/chevron_right.svg';
import iconDown from '../../assets/images/chevron_down.svg';
import { Modal } from "react-bootstrap";

const roomServices = new RoomServices();
const wsServices = createPeerConnectionContext();

let userMediaStream: any;

export const RoomHome = () => {

    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [color, setColor] = useState('');
    const [objects, setObjects] = useState([]);
    const [connectedUsers, setConnectedUsers] = useState([]);
    const [me, setMe] = useState<any>({});
    const [showModal, setShowModal] = useState(false);
    const [coordinates, setCoordinates] = useState([]);

    const { link } = useParams();
    const userId = localStorage.getItem('id') || '';
    const mobile = window.innerWidth <= 992;

    const getRoom = async () => {
        try {
            if (!link) {
                return navigate('/');
            }

            const result = await roomServices.getRoomByLink(link);

            if (!result || !result.data) {
                return;
            }

            const { color, name, objects } = result.data;

            setName(name);
            setColor(color);

            const newObjects = objects.map((o: any) => {
                return { ...o, type: o?.name?.split('_')[0] }
            });

            setObjects(newObjects);

            //Lógica para verificar quais objetos são do tipo que eu espero e guardar as cordenadas dele adicionando a altura e a largura dos objetos
            const filteredCoordinates = newObjects
                .filter((o: any) => o.type === 'table' || o.type === 'decor' || o.type === 'nature')
                .map((o: any) => {
                    if (o.type === 'table' && ['table_01', 'table_02', 'table_03'].includes(o.name)) {
                        const nextCoordinates = [];
                        for (let x = o.x; x < o.x + 2; x++) {
                            for (let y = o.y; y < o.y + 2; y++) {
                                nextCoordinates.push({ x, y });
                            }
                        }
                        // Supondo que 'x' e 'y' são as coordenadas x e y do objeto
                        return { type: o.type, name: o.name, id: o._id, x: o.x, y: o.y, nextCoordinates };
                    } else {
                        // Se não for uma mesa com os nomes específicos, retornamos suas coordenadas existentes sem calcular novas coordenadas
                        return { type: o.type, name: o.name, id: o._id, x: o.x, y: o.y, nextCoordinates: [] };
                    }
                });

            setCoordinates(filteredCoordinates);
            console.log(filteredCoordinates);


            userMediaStream = await navigator?.mediaDevices?.getUserMedia({
                video: {
                    width: { min: 640, ideal: 1280 },
                    height: { min: 400, ideal: 1080 },
                    aspectRatio: { ideal: 1.7777 },
                },
                audio: true
            });

            if (document.getElementById('localVideoRef')) {
                const videoRef: any = document.getElementById('localVideoRef');
                videoRef.srcObject = userMediaStream;
            }
        } catch (e) {
            console.log('Ocorreu erro ao buscar dados da sala:', e);
        }
    }

    useEffect(() => {
        getRoom();
    }, [])

    useEffect(() => {
        const handleMovement = (event: any) => doMovement(event); // Função para lidar com o evento de movimento

        document.addEventListener('keyup', handleMovement); // Adiciona o listener

        return () => {
            document.removeEventListener('keyup', handleMovement); // Remove o listener ao desmontar o componente
        }
    }, [coordinates]);


    const enterRoom = () => {
        if (!userMediaStream) {
            return setShowModal(true);
        }

        if (!link || !userId) {
            return navigate('/');
        }

        wsServices.joinRoom(link, userId);
        wsServices.onCallMade();
        wsServices.onUpdateUserList(async (users: any) => {
            if (users) {
                setConnectedUsers(users);
                localStorage.setItem('connectedUsers', JSON.stringify(users));

                const me = users.find((u: any) => u.user === userId);
                if (me) {
                    setMe(me);
                    localStorage.setItem('me', JSON.stringify(me));
                }

                const usersWithoutMe = users.filter((u: any) => u.user !== userId);
                for (const user of usersWithoutMe) {
                    wsServices.addPeerConnection(user.clientId, userMediaStream, (_stream: any) => {
                        if (document.getElementById(user.clientId)) {
                            const videoRef: any = document.getElementById(user.clientId);
                            videoRef.srcObject = _stream;
                        }
                    });
                }
            }
        });


        wsServices.onRemoveUser((socketId: any) => {
            const connectedStr = localStorage.getItem('connectedUsers') || '';
            const connectedUsers = JSON.parse(connectedStr);
            const filtered = connectedUsers?.filter((u: any) => u.clientId !== socketId);
            setConnectedUsers(filtered);
            wsServices.removePeerConnection(socketId);
        });

        wsServices.onAddUser((user: any) => {
            console.log('onAddUser', user);

            wsServices.addPeerConnection(user, userMediaStream, (_stream: any) => {
                if (document.getElementById(user)) {
                    const videoRef: any = document.getElementById(user);
                    videoRef.srcObject = _stream;
                }
            });

            wsServices.callUser(user);
        });

        wsServices.onAnswerMade((socket: any) => wsServices.callUser(socket));
    }

    const toggleMute = () => {
        const payload = {
            userId,
            link,
            muted: !me.muted
        }

        wsServices.updateUserMute(payload);
    }

    const doMovement = (event: any) => {

        const meStr = localStorage.getItem('me') || '';
        const user = JSON.parse(meStr);

        if (event && user) {
            const payload = {
                userId,
                link
            } as any;

            switch (event.key) {
                case 'ArrowUp':
                    payload.x = user.x;
                    payload.orientation = 'back';
                    if (user.orientation === 'back') {
                        payload.y = user.y > 1 ? user.y - 1 : 1;
                    } else {
                        payload.y = user.y;
                    }
                    break;
                case 'ArrowDown':
                    payload.x = user.x;
                    payload.orientation = 'front';
                    if (user.orientation === 'front') {
                        payload.y = user.y < 7 ? user.y + 1 : 7;
                    } else {
                        payload.y = user.y;
                    }
                    break;
                case 'ArrowLeft':
                    payload.y = user.y;
                    payload.orientation = 'left';
                    if (user.orientation === 'left') {
                        payload.x = user.x > 0 ? user.x - 1 : 0;
                    } else {
                        payload.x = user.x;
                    }
                    break;
                case 'ArrowRight':
                    payload.y = user.y;
                    payload.orientation = 'right';
                    if (user.orientation === 'right') {
                        payload.x = user.x < 7 ? user.x + 1 : 7;
                    } else {
                        payload.x = user.x;
                    }
                    break;
                default: break;
            }

            //Switch gera o payload.x e o payload.y que são as próximas coordenas 
            //Comparar as coordenadas do payload com as coordenadas que salvei e se elas forem iguais em algum caso o payload.x e payload.y devem ser igual a user.x a user.y
            // Se a próxima posição não estiver bloqueada, atualize o movimento do avatar
            // Verificar colisões
            const collision = coordinates.find((coord: any) => {
                if (Array.isArray(coord.nextCoordinates) && coord.nextCoordinates.length > 0) {
                    return coord.nextCoordinates.some((nextCoord: any) => nextCoord.x === payload.x && nextCoord.y === payload.y);
                } else {
                    return coord.x === payload.x && coord.y === payload.y && (coord.type === 'table' || coord.type === 'decor' || coord.type === 'nature');
                }
            });

            // Se houver colisão, manter as coordenadas atuais do usuário
            if (collision) {
                console.log("Colisão", collision);
                payload.x = user.x;
                payload.y = user.y;
            }

            if (payload.x >= 0 && payload.y >= 0 && payload.orientation) {
                wsServices.updateUserMovement(payload);
            }
        }
    }

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href);
    }

    const getUsersWithoutMe = () => {
        return connectedUsers.filter((u: any) => u.user !== userId);
    }

    return (
        <>

            <div className="container-principal">
                <div className="container-room">
                    {
                        objects?.length > 0
                            ?
                            <>
                                <div className="resume">
                                    <div onClick={copyLink}>
                                        <span><strong>Reunião</strong> {link}</span>
                                        <img src={copyIcon} />
                                    </div>
                                    <p style={{ color }}>{name}</p>
                                    <audio id='localVideoRef' playsInline autoPlay muted />
                                    {getUsersWithoutMe()?.map((user: any) =>
                                        <audio key={user.clientId} id={user.clientId}
                                            playsInline autoPlay muted={user?.muted} />
                                    )}
                                </div>
                                <RoomObjects
                                    objects={objects}
                                    enterRoom={enterRoom}
                                    connectedUsers={connectedUsers}
                                    me={me}
                                    toggleMute={toggleMute}
                                />
                                {mobile && me?.user &&
                                    <div className="movement">
                                        <div className="button" onClick={() => doMovement({ key: 'ArrowUp' })}>
                                            <img src={iconUp} alt="Andar para cima" />
                                        </div>
                                        <div className="line">
                                            <div className="button" onClick={() => doMovement({ key: 'ArrowLeft' })}>
                                                <img src={iconLeft} alt="Andar para esquerda" />
                                            </div>
                                            <div className="button" onClick={() => doMovement({ key: 'ArrowDown' })}>
                                                <img src={iconDown} alt="Andar para baixo" />
                                            </div>
                                            <div className="button" onClick={() => doMovement({ key: 'ArrowRight' })}>
                                                <img src={iconRight} alt="Andar para direita" />
                                            </div>
                                        </div>
                                    </div>}
                            </>

                            :
                            <div className="empty">
                                <img src={emptyIcon} />
                                <p>Reunião não encontrada :/</p>
                            </div>
                    }
                </div>
            </div>
            <Modal
                show={showModal}
                onHide={() => setShowModal(false)}
                className="container-modal">
                <Modal.Body>
                    <div className="content">
                        <div className="container">
                            <span>Aviso!</span>
                            <p>Habilite a permissão de audio e vídeo para participar das reuniões.</p>
                        </div>
                        <div className="actions">
                            <button onClick={() => setShowModal(false)}>Ok</button>
                        </div>
                    </div>
                </Modal.Body>
            </Modal>
        </>

    );
}